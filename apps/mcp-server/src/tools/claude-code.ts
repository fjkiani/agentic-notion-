/**
 * claude-code-tools — MCP tools inspired by Claude Code's tool set.
 *
 * Provides file I/O, bash execution, and web access to CAID agents.
 * All file operations are sandboxed to REPO_ROOT.
 * No external runtime dependencies — uses Node.js built-ins only.
 */

import { spawn } from "child_process";
import * as fs from "fs/promises";
import * as fsSync from "fs";
import * as path from "path";
import { z } from "zod";
import type { MCPToolDefinition } from "../registry.js";

// ─── Sandbox root ─────────────────────────────────────────────────────────────

/**
 * Lazily resolve REPO_ROOT at call time so tests can override
 * process.env.REPO_ROOT after module load.
 */
function getRepoRoot(): string {
  return path.resolve(process.env.REPO_ROOT ?? process.cwd());
}

/**
 * Resolve a relative path and assert it stays within REPO_ROOT.
 * Throws on path traversal attempts.
 */
function assertSafePath(filePath: string): string {
  const root = getRepoRoot();
  const resolved = path.resolve(root, filePath);
  if (!resolved.startsWith(root + path.sep) && resolved !== root) {
    throw new Error(
      `Path traversal blocked: "${filePath}" resolves outside repo root.`
    );
  }
  return resolved;
}

// ─── Glob helper (Node 20 compatible) ────────────────────────────────────────

/**
 * Minimal glob: supports * and ** wildcards.
 * Returns absolute paths matching the pattern under root.
 */
async function globFiles(pattern: string, root: string): Promise<string[]> {
  const regexStr = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*\//g, "(.+/)?")
    .replace(/\*/g, "[^/]*")
    .replace(/\?/g, "[^/]");
  const regex = new RegExp(`^${regexStr}$`);

  const results: string[] = [];

  async function walk(dir: string): Promise<void> {
    let entries: fsSync.Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const rel = path.relative(root, fullPath);
      if (entry.isDirectory()) {
        if (["node_modules", ".git", "dist", ".next", ".turbo"].includes(entry.name)) {
          continue;
        }
        await walk(fullPath);
      } else if (entry.isFile()) {
        if (regex.test(rel)) {
          results.push(fullPath);
        }
      }
    }
  }

  await walk(root);
  return results;
}

// ─── HTML → plain text (no cheerio dependency) ───────────────────────────────

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/(p|div|li|h[1-6]|tr|br|section|article|header|footer|nav|aside)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ─── Tool: claude_code_bash ───────────────────────────────────────────────────

const claudeCodeBashTool: MCPToolDefinition = {
  name: "claude_code_bash",
  description:
    "Execute a bash command in the repo root. Returns stdout, stderr, and exit code. " +
    "Timeout defaults to 30 seconds (max 120s). Working directory defaults to repo root. " +
    "Use for running tests, builds, linting, git operations, and any shell command.",
  inputSchema: z.object({
    command: z.string().describe("Bash command to execute"),
    timeout_ms: z.number().int().min(1000).max(120000).optional().default(30000),
    cwd: z
      .string()
      .optional()
      .describe("Subdirectory to run in (relative to repo root, optional)"),
  }),
  handler: async (rawInput) => {
    const input = rawInput as { command: string; timeout_ms?: number; cwd?: string };
    const timeoutMs = input.timeout_ms ?? 30000;
    const workDir = input.cwd ? assertSafePath(input.cwd) : getRepoRoot();

    return new Promise((resolve, reject) => {
      let stdout = "";
      let stderr = "";
      let timedOut = false;

      const proc = spawn("bash", ["-c", input.command], {
        cwd: workDir,
        env: { ...process.env },
      });

      const timer = setTimeout(() => {
        timedOut = true;
        proc.kill("SIGTERM");
        setTimeout(() => proc.kill("SIGKILL"), 2000);
      }, timeoutMs);

      proc.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString();
        if (stdout.length > 50000) stdout = stdout.slice(-50000);
      });

      proc.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
        if (stderr.length > 10000) stderr = stderr.slice(-10000);
      });

      proc.on("close", (code) => {
        clearTimeout(timer);
        resolve({
          exitCode: timedOut ? -1 : (code ?? 0),
          timedOut,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
        });
      });

      proc.on("error", (err) => {
        clearTimeout(timer);
        reject(new Error(`Process spawn error: ${err.message}`));
      });
    });
  },
};

// ─── Tool: claude_code_file_read ──────────────────────────────────────────────

const claudeCodeFileReadTool: MCPToolDefinition = {
  name: "claude_code_file_read",
  description:
    "Read one or more files. Supports glob patterns (e.g. 'apps/**/*.ts'). " +
    "Returns a map of relative path → content. Skips node_modules, dist, .git, .next, .turbo. " +
    "Use to inspect source files before editing them.",
  inputSchema: z.object({
    path: z
      .string()
      .describe("File path or glob pattern relative to repo root"),
    max_bytes_per_file: z
      .number()
      .int()
      .min(100)
      .max(200000)
      .optional()
      .default(50000),
    max_files: z.number().int().min(1).max(50).optional().default(20),
  }),
  handler: async (rawInput) => {
    const input = rawInput as {
      path: string;
      max_bytes_per_file?: number;
      max_files?: number;
    };
    const maxBytes = input.max_bytes_per_file ?? 50000;
    const maxFiles = input.max_files ?? 20;

    const isGlob = input.path.includes("*") || input.path.includes("?");
    let filePaths: string[];

    const repoRoot = getRepoRoot();
    if (isGlob) {
      filePaths = (await globFiles(input.path, repoRoot)).slice(0, maxFiles);
    } else {
      filePaths = [assertSafePath(input.path)];
    }

    const results: Record<string, string> = {};
    for (const absPath of filePaths) {
      const rel = path.relative(repoRoot, absPath);
      try {
        const content = await fs.readFile(absPath, "utf-8");
        results[rel] =
          content.length > maxBytes
            ? content.slice(0, maxBytes) + `\n... [truncated at ${maxBytes} bytes]`
            : content;
      } catch (err) {
        results[rel] = `ERROR: ${err instanceof Error ? err.message : String(err)}`;
      }
    }

    return {
      filesRead: Object.keys(results).length,
      files: results,
    };
  },
};

// ─── Tool: claude_code_file_write ─────────────────────────────────────────────

const claudeCodeFileWriteTool: MCPToolDefinition = {
  name: "claude_code_file_write",
  description:
    "Write content to a file, creating parent directories as needed. " +
    "Overwrites existing files. Path must be relative to repo root. " +
    "Use for creating new files. For editing existing files, prefer claude_code_file_edit.",
  inputSchema: z.object({
    path: z.string().describe("File path relative to repo root"),
    content: z.string().describe("Full file content to write"),
  }),
  handler: async (rawInput) => {
    const input = rawInput as { path: string; content: string };
    const absPath = assertSafePath(input.path);
    await fs.mkdir(path.dirname(absPath), { recursive: true });
    await fs.writeFile(absPath, input.content, "utf-8");
    return {
      written: true,
      path: input.path,
      bytes: Buffer.byteLength(input.content, "utf-8"),
    };
  },
};

// ─── Tool: claude_code_file_edit ──────────────────────────────────────────────

const claudeCodeFileEditTool: MCPToolDefinition = {
  name: "claude_code_file_edit",
  description:
    "Make a targeted edit to an existing file by replacing the first occurrence of " +
    "old_string with new_string. Throws if old_string is not found. " +
    "Always read the file first with claude_code_file_read to get the exact string to replace.",
  inputSchema: z.object({
    path: z.string().describe("File path relative to repo root"),
    old_string: z.string().describe("Exact string to find and replace (must be unique in the file)"),
    new_string: z.string().describe("Replacement string"),
  }),
  handler: async (rawInput) => {
    const input = rawInput as { path: string; old_string: string; new_string: string };
    const absPath = assertSafePath(input.path);
    const content = await fs.readFile(absPath, "utf-8");
    if (!content.includes(input.old_string)) {
      throw new Error(
        `old_string not found in "${input.path}". Read the file first to get the exact content.`
      );
    }
    const updated = content.replace(input.old_string, input.new_string);
    await fs.writeFile(absPath, updated, "utf-8");
    return {
      edited: true,
      path: input.path,
      replacements: 1,
    };
  },
};

// ─── Tool: claude_code_web_search ─────────────────────────────────────────────

const claudeCodeWebSearchTool: MCPToolDefinition = {
  name: "claude_code_web_search",
  description:
    "Search the web using Brave Search API. Returns titles, URLs, and snippets. " +
    "Requires BRAVE_API_KEY environment variable. " +
    "Use for finding recent news, FDA approvals, policy documents, and grey literature " +
    "not indexed in PubMed or ClinicalTrials.gov.",
  inputSchema: z.object({
    query: z.string().describe("Search query"),
    count: z.number().int().min(1).max(20).optional().default(10),
  }),
  handler: async (rawInput) => {
    const input = rawInput as { query: string; count?: number };
    const apiKey = process.env.BRAVE_API_KEY;
    if (!apiKey) {
      throw new Error(
        "BRAVE_API_KEY environment variable is not set. " +
        "Add it to the MCP server environment to enable web search."
      );
    }

    const url = new URL("https://api.search.brave.com/res/v1/web/search");
    url.searchParams.set("q", input.query);
    url.searchParams.set("count", String(input.count ?? 10));

    const res = await fetch(url.toString(), {
      headers: {
        "Accept": "application/json",
        "Accept-Encoding": "gzip",
        "X-Subscription-Token": apiKey,
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      throw new Error(`Brave Search API error: ${res.status} ${res.statusText}`);
    }

    const data = await res.json() as {
      web?: {
        results?: Array<{
          title: string;
          url: string;
          description?: string;
          page_age?: string;
        }>;
        totalEstimatedMatches?: number;
      };
    };

    const results = (data.web?.results ?? []).map((r) => ({
      title: r.title,
      url: r.url,
      snippet: r.description ?? "",
      age: r.page_age ?? "",
    }));

    return {
      query: input.query,
      totalResults: data.web?.totalEstimatedMatches ?? results.length,
      results,
    };
  },
};

// ─── Tool: claude_code_web_fetch ──────────────────────────────────────────────

const claudeCodeWebFetchTool: MCPToolDefinition = {
  name: "claude_code_web_fetch",
  description:
    "Fetch the content of a URL and return it as plain text (HTML stripped). " +
    "Optionally enforced against an ALLOWED_DOMAINS allowlist (comma-separated env var). " +
    "Use to read the full text of a specific page found via claude_code_web_search.",
  inputSchema: z.object({
    url: z.string().url().describe("URL to fetch"),
    max_chars: z.number().int().min(1000).max(100000).optional().default(20000),
  }),
  handler: async (rawInput) => {
    const input = rawInput as { url: string; max_chars?: number };
    const maxChars = input.max_chars ?? 20000;

    // Domain allowlist check
    const allowedDomains = process.env.ALLOWED_DOMAINS;
    if (allowedDomains) {
      const allowed = allowedDomains.split(",").map((d) => d.trim().toLowerCase());
      const hostname = new URL(input.url).hostname.toLowerCase();
      const isAllowed = allowed.some(
        (d) => hostname === d || hostname.endsWith("." + d)
      );
      if (!isAllowed) {
        throw new Error(
          `Domain "${hostname}" is not in the ALLOWED_DOMAINS allowlist. ` +
          `Allowed: ${allowedDomains}`
        );
      }
    }

    const res = await fetch(input.url, {
      headers: {
        "User-Agent": "CAID-Research-Agent/1.0 (Cancer Advocacy Intelligence Database)",
        "Accept": "text/html,application/xhtml+xml,text/plain",
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText} fetching ${input.url}`);
    }

    const contentType = res.headers.get("content-type") ?? "";
    const raw = await res.text();
    const text = contentType.includes("html") ? htmlToText(raw) : raw;
    const truncated = text.length > maxChars;

    return {
      url: input.url,
      contentType,
      chars: Math.min(text.length, maxChars),
      truncated,
      content: truncated ? text.slice(0, maxChars) + "\n... [truncated]" : text,
    };
  },
};

// ─── Exports ──────────────────────────────────────────────────────────────────

export const claudeCodeTools: MCPToolDefinition[] = [
  claudeCodeBashTool,
  claudeCodeFileReadTool,
  claudeCodeFileWriteTool,
  claudeCodeFileEditTool,
  claudeCodeWebSearchTool,
  claudeCodeWebFetchTool,
];
