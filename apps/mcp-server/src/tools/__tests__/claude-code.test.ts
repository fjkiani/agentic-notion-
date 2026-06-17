/**
 * Unit tests for claude-code MCP tools.
 *
 * Run with:
 *   cd apps/mcp-server && node --import tsx --test src/tools/__tests__/claude-code.test.ts
 *
 * Uses Node.js built-in test runner (node:test) — no extra dependencies.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

import { claudeCodeTools } from "../claude-code.js";

function getTool(name: string) {
  const tool = claudeCodeTools.find((t) => t.name === name);
  if (!tool) throw new Error(`Tool not found: ${name}`);
  return tool.handler;
}

let sandboxDir: string;

before(async () => {
  sandboxDir = await fs.mkdtemp(path.join(os.tmpdir(), "caid-test-"));
  process.env.REPO_ROOT = sandboxDir;

  await fs.writeFile(path.join(sandboxDir, "hello.txt"), "Hello, CAID!\nLine two.\n");
  await fs.mkdir(path.join(sandboxDir, "subdir"), { recursive: true });
  await fs.writeFile(path.join(sandboxDir, "subdir", "nested.ts"), "export const x = 42;\n");
});

after(async () => {
  await fs.rm(sandboxDir, { recursive: true, force: true });
  delete process.env.REPO_ROOT;
});

// ─── claude_code_bash ─────────────────────────────────────────────────────────

describe("claude_code_bash", () => {
  const bash = getTool("claude_code_bash");

  it("runs a simple echo command", async () => {
    const result = (await bash({ command: "echo hello" })) as {
      exitCode: number; stdout: string; stderr: string; timedOut: boolean;
    };
    assert.equal(result.exitCode, 0);
    assert.equal(result.stdout, "hello");
    assert.equal(result.timedOut, false);
  });

  it("captures non-zero exit codes", async () => {
    const result = (await bash({ command: "exit 42" })) as { exitCode: number };
    assert.equal(result.exitCode, 42);
  });

  it("captures stderr separately", async () => {
    const result = (await bash({ command: "echo err >&2" })) as {
      exitCode: number; stdout: string; stderr: string;
    };
    assert.equal(result.exitCode, 0);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr, "err");
  });

  it("enforces timeout", async () => {
    const result = (await bash({ command: "sleep 10", timeout_ms: 500 })) as {
      exitCode: number; timedOut: boolean;
    };
    assert.equal(result.timedOut, true);
    assert.equal(result.exitCode, -1);
  });

  it("runs in sandbox cwd by default", async () => {
    const result = (await bash({ command: "pwd" })) as { stdout: string };
    assert.equal(result.stdout, sandboxDir);
  });

  it("rejects path traversal in cwd", async () => {
    await assert.rejects(
      () => bash({ command: "pwd", cwd: "../../etc" }),
      /Path traversal blocked/
    );
  });
});

// ─── claude_code_file_read ────────────────────────────────────────────────────

describe("claude_code_file_read", () => {
  const fileRead = getTool("claude_code_file_read");

  it("reads an existing file", async () => {
    const result = (await fileRead({ path: "hello.txt" })) as {
      filesRead: number; files: Record<string, string>;
    };
    assert.equal(result.filesRead, 1);
    assert.ok(result.files["hello.txt"].includes("Hello, CAID!"));
  });

  it("returns error message for missing file", async () => {
    const result = (await fileRead({ path: "nonexistent.txt" })) as {
      files: Record<string, string>;
    };
    assert.ok(result.files["nonexistent.txt"].startsWith("ERROR:"));
  });

  it("reads files matching a glob pattern", async () => {
    const result = (await fileRead({ path: "**/*.ts" })) as {
      filesRead: number; files: Record<string, string>;
    };
    assert.ok(result.filesRead >= 1);
    assert.ok(Object.keys(result.files).some((k) => k.endsWith(".ts")));
  });

  it("truncates files exceeding max_bytes_per_file", async () => {
    const result = (await fileRead({ path: "hello.txt", max_bytes_per_file: 5 })) as {
      files: Record<string, string>;
    };
    assert.ok(result.files["hello.txt"].includes("[truncated"));
  });

  it("blocks path traversal", async () => {
    await assert.rejects(
      () => fileRead({ path: "../../etc/passwd" }),
      /Path traversal blocked/
    );
  });
});

// ─── claude_code_file_write ───────────────────────────────────────────────────

describe("claude_code_file_write", () => {
  const fileWrite = getTool("claude_code_file_write");
  const fileRead = getTool("claude_code_file_read");

  it("creates a new file", async () => {
    const result = (await fileWrite({ path: "new-file.txt", content: "created by test" })) as {
      written: boolean; path: string;
    };
    assert.equal(result.written, true);
    assert.equal(result.path, "new-file.txt");
  });

  it("creates parent directories automatically", async () => {
    await fileWrite({ path: "deep/nested/dir/file.txt", content: "nested" });
    const read = (await fileRead({ path: "deep/nested/dir/file.txt" })) as {
      files: Record<string, string>;
    };
    assert.ok(read.files["deep/nested/dir/file.txt"].includes("nested"));
  });

  it("overwrites an existing file", async () => {
    await fileWrite({ path: "new-file.txt", content: "overwritten" });
    const read = (await fileRead({ path: "new-file.txt" })) as {
      files: Record<string, string>;
    };
    assert.ok(read.files["new-file.txt"].includes("overwritten"));
  });

  it("blocks path traversal", async () => {
    await assert.rejects(
      () => fileWrite({ path: "../../etc/evil.txt", content: "bad" }),
      /Path traversal blocked/
    );
  });
});

// ─── claude_code_file_edit ────────────────────────────────────────────────────

describe("claude_code_file_edit", () => {
  const fileEdit = getTool("claude_code_file_edit");
  const fileRead = getTool("claude_code_file_read");

  it("replaces an exact string", async () => {
    const result = (await fileEdit({
      path: "hello.txt",
      old_string: "Hello, CAID!",
      new_string: "Hello, World!",
    })) as { edited: boolean };
    assert.equal(result.edited, true);
    const read = (await fileRead({ path: "hello.txt" })) as {
      files: Record<string, string>;
    };
    assert.ok(read.files["hello.txt"].includes("Hello, World!"));
  });

  it("throws when old_string is not found", async () => {
    await assert.rejects(
      () => fileEdit({ path: "hello.txt", old_string: "DOES_NOT_EXIST", new_string: "x" }),
      /old_string not found/
    );
  });

  it("blocks path traversal", async () => {
    await assert.rejects(
      () => fileEdit({ path: "../../etc/passwd", old_string: "root", new_string: "evil" }),
      /Path traversal blocked/
    );
  });
});

// ─── claude_code_web_search ───────────────────────────────────────────────────

describe("claude_code_web_search", () => {
  const webSearch = getTool("claude_code_web_search");

  it("throws when BRAVE_API_KEY is not set", async () => {
    const saved = process.env.BRAVE_API_KEY;
    delete process.env.BRAVE_API_KEY;
    await assert.rejects(() => webSearch({ query: "test" }), /BRAVE_API_KEY/);
    if (saved) process.env.BRAVE_API_KEY = saved;
  });

  it("returns structured results from mocked API", async () => {
    process.env.BRAVE_API_KEY = "test-key";
    const savedFetch = global.fetch;
    global.fetch = (async () => ({
      ok: true,
      json: async () => ({
        web: {
          totalEstimatedMatches: 1,
          results: [{ title: "Test", url: "https://example.com", description: "A test result" }],
        },
      }),
    })) as unknown as typeof fetch;

    const result = (await webSearch({ query: "cancer advocacy" })) as {
      query: string; totalResults: number; results: Array<{ title: string; url: string }>;
    };
    assert.equal(result.query, "cancer advocacy");
    assert.equal(result.results.length, 1);
    assert.equal(result.results[0].title, "Test");

    global.fetch = savedFetch;
    delete process.env.BRAVE_API_KEY;
  });

  it("throws on non-200 API response", async () => {
    process.env.BRAVE_API_KEY = "test-key";
    const savedFetch = global.fetch;
    global.fetch = (async () => ({
      ok: false,
      status: 429,
      statusText: "Too Many Requests",
    })) as unknown as typeof fetch;

    await assert.rejects(() => webSearch({ query: "test" }), /429/);

    global.fetch = savedFetch;
    delete process.env.BRAVE_API_KEY;
  });
});

// ─── claude_code_web_fetch ────────────────────────────────────────────────────

describe("claude_code_web_fetch", () => {
  const webFetch = getTool("claude_code_web_fetch");

  it("strips HTML tags and returns plain text", async () => {
    const savedFetch = global.fetch;
    global.fetch = (async () => ({
      ok: true,
      headers: { get: () => "text/html" },
      text: async () => "<html><body><h1>Title</h1><p>Content here</p></body></html>",
    })) as unknown as typeof fetch;

    const result = (await webFetch({ url: "https://example.com" })) as {
      content: string; truncated: boolean;
    };
    assert.ok(result.content.includes("Title"));
    assert.ok(result.content.includes("Content here"));
    assert.ok(!result.content.includes("<html>"));
    assert.equal(result.truncated, false);

    global.fetch = savedFetch;
  });

  it("enforces domain allowlist when ALLOWED_DOMAINS is set", async () => {
    process.env.ALLOWED_DOMAINS = "pubmed.ncbi.nlm.nih.gov,clinicaltrials.gov";
    await assert.rejects(
      () => webFetch({ url: "https://evil.com/page" }),
      /not in the ALLOWED_DOMAINS/
    );
    delete process.env.ALLOWED_DOMAINS;
  });

  it("allows domains matching the allowlist", async () => {
    process.env.ALLOWED_DOMAINS = "pubmed.ncbi.nlm.nih.gov,clinicaltrials.gov";
    const savedFetch = global.fetch;
    global.fetch = (async () => ({
      ok: true,
      headers: { get: () => "text/plain" },
      text: async () => "PubMed content",
    })) as unknown as typeof fetch;

    const result = (await webFetch({ url: "https://pubmed.ncbi.nlm.nih.gov/12345" })) as {
      content: string;
    };
    assert.ok(result.content.includes("PubMed content"));

    global.fetch = savedFetch;
    delete process.env.ALLOWED_DOMAINS;
  });

  it("truncates content exceeding max_chars", async () => {
    const savedFetch = global.fetch;
    global.fetch = (async () => ({
      ok: true,
      headers: { get: () => "text/plain" },
      text: async () => "x".repeat(50000),
    })) as unknown as typeof fetch;

    const result = (await webFetch({ url: "https://example.com", max_chars: 100 })) as {
      truncated: boolean; content: string;
    };
    assert.equal(result.truncated, true);
    assert.ok(result.content.includes("[truncated]"));

    global.fetch = savedFetch;
  });

  it("throws on HTTP error status", async () => {
    const savedFetch = global.fetch;
    global.fetch = (async () => ({
      ok: false,
      status: 404,
      statusText: "Not Found",
    })) as unknown as typeof fetch;

    await assert.rejects(() => webFetch({ url: "https://example.com/missing" }), /404/);

    global.fetch = savedFetch;
  });
});

// ─── tool registration ────────────────────────────────────────────────────────

describe("tool registration", () => {
  it("exports exactly 6 tools", () => {
    assert.equal(claudeCodeTools.length, 6);
  });

  it("all tools have required fields", () => {
    for (const tool of claudeCodeTools) {
      assert.ok(tool.name, `${tool.name} missing name`);
      assert.ok(tool.description, `${tool.name} missing description`);
      assert.ok(tool.inputSchema, `${tool.name} missing inputSchema`);
      assert.ok(typeof tool.handler === "function", `${tool.name} missing handler`);
    }
  });

  it("tool names match expected set", () => {
    const names = new Set(claudeCodeTools.map((t) => t.name));
    const expected = new Set([
      "claude_code_bash",
      "claude_code_file_read",
      "claude_code_file_write",
      "claude_code_file_edit",
      "claude_code_web_search",
      "claude_code_web_fetch",
    ]);
    assert.deepEqual(names, expected);
  });
});
