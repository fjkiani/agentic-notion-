/**
 * Archon Self-Healing Runner
 * ===========================
 * Parses .archon/workflows/*.yaml and executes them as real pipelines.
 *
 * Node types supported:
 *   bash     → spawn child_process, stream stdout/stderr live via SSE
 *   command  → call a named command from .archon/commands/*.md via LLM
 *   loop     → iterate LLM+bash until <promise>DONE</promise> or max_iterations
 *   approval → pause, emit SSE event, wait for HTTP resume call
 *
 * Self-healing: if a bash node exits non-zero, the runner automatically
 * invokes a "fix-it" LLM cycle that reads the error, patches the code,
 * and re-runs — up to MAX_FIX_ATTEMPTS times before failing.
 *
 * SSE stream format:
 *   event: log
 *   data: {"type":"stdout"|"stderr"|"info"|"error"|"done"|"approval", "text":"...", "nodeId":"..."}
 */

import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as yaml from "js-yaml";
import type { Response } from "express";

// ─── TYPES ────────────────────────────────────────────────────────────────────

interface WorkflowNode {
  id: string;
  depends_on?: string[];
  description?: string;
  // Node types (exactly one present):
  bash?: string;
  command?: string;
  prompt?: string;
  loop?: {
    prompt: string;
    until: string;
    max_iterations?: number;
    fresh_context?: boolean;
  };
  approval?: {
    message: string;
    capture_response?: boolean;
    on_reject?: { prompt: string; max_attempts?: number };
  };
}

interface Workflow {
  name: string;
  description: string;
  nodes: WorkflowNode[];
}

interface RunContext {
  runId: string;
  workflowName: string;
  userMessage: string;
  artifactsDir: string;
  repoRoot: string;
  env: Record<string, string>;
}

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const REPO_ROOT = path.resolve(process.cwd());
const ARCHON_DIR = path.join(REPO_ROOT, ".archon");
const WORKFLOWS_DIR = path.join(ARCHON_DIR, "workflows");
const COMMANDS_DIR = path.join(ARCHON_DIR, "commands");
const ARTIFACTS_BASE = path.join(REPO_ROOT, ".archon", "runs");
const MAX_FIX_ATTEMPTS = 3;
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY ?? "";
const LLM_MODEL = "openai/gpt-oss-120b:free";

// Pending approval gates: runId → resolve function
const pendingApprovals = new Map<string, (approved: boolean, feedback?: string) => void>();

// ─── SSE HELPERS ─────────────────────────────────────────────────────────────

function sseEmit(res: Response, type: string, text: string, nodeId: string, extra?: Record<string, unknown>) {
  const data = JSON.stringify({ type, text, nodeId, ts: new Date().toISOString(), ...extra });
  res.write(`event: log\ndata: ${data}\n\n`);
}

function sseInfo(res: Response, text: string, nodeId = "runner") {
  sseEmit(res, "info", text, nodeId);
}

function sseDone(res: Response, summary: string) {
  const data = JSON.stringify({ type: "done", text: summary, ts: new Date().toISOString() });
  res.write(`event: done\ndata: ${data}\n\n`);
  res.end();
}

function sseError(res: Response, text: string, nodeId = "runner") {
  sseEmit(res, "error", text, nodeId);
}

// ─── BASH EXECUTOR ───────────────────────────────────────────────────────────

async function runBash(
  command: string,
  ctx: RunContext,
  res: Response,
  nodeId: string
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    sseInfo(res, `$ ${command}`, nodeId);

    const proc = spawn("bash", ["-c", command], {
      cwd: ctx.repoRoot,
      env: { ...process.env, ...ctx.env },
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stdout += text;
      // Stream each line live
      for (const line of text.split("\n")) {
        if (line.trim()) sseEmit(res, "stdout", line, nodeId);
      }
    });

    proc.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stderr += text;
      for (const line of text.split("\n")) {
        if (line.trim()) sseEmit(res, "stderr", line, nodeId);
      }
    });

    proc.on("close", (code) => {
      resolve({ exitCode: code ?? 0, stdout, stderr });
    });

    proc.on("error", (err) => {
      sseEmit(res, "stderr", `Process error: ${err.message}`, nodeId);
      resolve({ exitCode: 1, stdout, stderr: err.message });
    });
  });
}

// ─── LLM CALLER ──────────────────────────────────────────────────────────────

async function callLLM(prompt: string, systemPrompt?: string): Promise<string> {
  const messages = [];
  if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
  messages.push({ role: "user", content: prompt });

  const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENROUTER_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: LLM_MODEL,
      messages,
      temperature: 0.1,
      max_tokens: 4000,
    }),
  });

  if (!resp.ok) {
    throw new Error(`LLM API error: ${resp.status} ${await resp.text()}`);
  }

  const data = await resp.json() as { choices: Array<{ message: { content: string } }> };
  let content = data.choices[0]?.message?.content ?? "";
  // Strip thinking tags
  if (content.includes("</think>")) {
    content = content.slice(content.lastIndexOf("</think>") + 8).trim();
  }
  return content;
}

// ─── SELF-HEALING BASH ────────────────────────────────────────────────────────

async function runBashWithHealing(
  command: string,
  ctx: RunContext,
  res: Response,
  nodeId: string
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  let currentCommand = command;

  for (let attempt = 0; attempt <= MAX_FIX_ATTEMPTS; attempt++) {
    const result = await runBash(currentCommand, ctx, res, nodeId);

    if (result.exitCode === 0) {
      return result;
    }

    if (attempt === MAX_FIX_ATTEMPTS) {
      sseEmit(res, "error", `Command failed after ${MAX_FIX_ATTEMPTS} fix attempts. Giving up.`, nodeId);
      return result;
    }

    // Self-healing: ask LLM to fix the failing command
    sseInfo(res, `[SELF-HEAL] Exit code ${result.exitCode}. Attempting auto-fix (attempt ${attempt + 1}/${MAX_FIX_ATTEMPTS})...`, nodeId);

    const fixPrompt = `A bash command failed in a CAID monorepo (TypeScript/Node.js/pnpm workspace).

Failed command:
\`\`\`bash
${currentCommand}
\`\`\`

STDOUT:
${result.stdout.slice(-2000)}

STDERR:
${result.stderr.slice(-2000)}

Repo root: ${ctx.repoRoot}
Context: ${ctx.userMessage}

Provide ONLY the fixed bash command (no explanation, no markdown, just the raw command):`;

    try {
      const fixed = await callLLM(fixPrompt);
      // Extract just the command (strip markdown code blocks if present)
      currentCommand = fixed
        .replace(/^```(?:bash)?\n?/m, "")
        .replace(/\n?```$/m, "")
        .trim();

      sseInfo(res, `[SELF-HEAL] Fixed command: ${currentCommand}`, nodeId);
    } catch (e) {
      sseEmit(res, "error", `Self-heal LLM call failed: ${e}`, nodeId);
      return result;
    }
  }

  return { exitCode: 1, stdout: "", stderr: "Max fix attempts exceeded" };
}

// ─── COMMAND EXECUTOR ─────────────────────────────────────────────────────────

async function runCommand(
  commandName: string,
  ctx: RunContext,
  res: Response,
  nodeId: string,
  extraPrompt?: string
): Promise<string> {
  const cmdFile = path.join(COMMANDS_DIR, `${commandName}.md`);
  let commandSpec = "";

  if (fs.existsSync(cmdFile)) {
    commandSpec = fs.readFileSync(cmdFile, "utf-8");
  } else {
    commandSpec = `Execute the command: ${commandName}`;
  }

  // Read codebase skill for context
  const skillFile = path.join(ARCHON_DIR, "skills", "zeta-codebase.md");
  const skillContext = fs.existsSync(skillFile) ? fs.readFileSync(skillFile, "utf-8") : "";

  const prompt = `${commandSpec}

${extraPrompt ? `\nAdditional context: ${extraPrompt}` : ""}

User request: ${ctx.userMessage}
Artifacts directory: ${ctx.artifactsDir}
Repo root: ${ctx.repoRoot}

${skillContext ? `\nCodebase context:\n${skillContext.slice(0, 3000)}` : ""}`;

  sseInfo(res, `[COMMAND] Running: ${commandName}`, nodeId);

  const output = await callLLM(prompt);

  // Save output to artifacts
  const outFile = path.join(ctx.artifactsDir, `${nodeId}-output.md`);
  fs.writeFileSync(outFile, output);

  sseInfo(res, `[COMMAND] ${commandName} complete. Output saved to ${nodeId}-output.md`, nodeId);

  // Stream a preview
  const preview = output.slice(0, 500);
  sseEmit(res, "stdout", preview + (output.length > 500 ? "\n... (truncated, see artifacts)" : ""), nodeId);

  return output;
}

// ─── LOOP EXECUTOR ────────────────────────────────────────────────────────────

async function runLoop(
  loopConfig: NonNullable<WorkflowNode["loop"]>,
  ctx: RunContext,
  res: Response,
  nodeId: string
): Promise<void> {
  const maxIter = loopConfig.max_iterations ?? 10;
  const untilToken = loopConfig.until;

  sseInfo(res, `[LOOP] Starting loop (max ${maxIter} iterations, until: ${untilToken})`, nodeId);

  // Read progress tracker
  const progressFile = path.join(ctx.artifactsDir, "progress.json");
  let progress: Record<string, unknown> = {};
  if (fs.existsSync(progressFile)) {
    progress = JSON.parse(fs.readFileSync(progressFile, "utf-8"));
  }

  for (let iter = 0; iter < maxIter; iter++) {
    sseInfo(res, `[LOOP] Iteration ${iter + 1}/${maxIter}`, nodeId);

    // Substitute variables in prompt
    let prompt = loopConfig.prompt
      .replace(/\$USER_MESSAGE/g, ctx.userMessage)
      .replace(/\$ARTIFACTS_DIR/g, ctx.artifactsDir)
      .replace(/\$REPO_ROOT/g, ctx.repoRoot);

    // Add progress context
    prompt += `\n\nCurrent progress: ${JSON.stringify(progress, null, 2)}`;

    const output = await callLLM(prompt);

    // Stream output
    sseEmit(res, "stdout", output.slice(0, 1000), nodeId);

    // Check for completion token
    if (output.includes(`<promise>${untilToken}</promise>`)) {
      sseInfo(res, `[LOOP] Completion token found: ${untilToken}. Loop done.`, nodeId);

      // Extract and run any bash commands in the output
      const bashBlocks = output.match(/```bash\n([\s\S]*?)```/g) ?? [];
      for (const block of bashBlocks) {
        const cmd = block.replace(/```bash\n/, "").replace(/```$/, "").trim();
        await runBashWithHealing(cmd, ctx, res, `${nodeId}-bash`);
      }

      return;
    }

    // Extract and run bash commands from this iteration
    const bashBlocks = output.match(/```bash\n([\s\S]*?)```/g) ?? [];
    for (const block of bashBlocks) {
      const cmd = block.replace(/```bash\n/, "").replace(/```$/, "").trim();
      const result = await runBashWithHealing(cmd, ctx, res, `${nodeId}-bash-${iter}`);

      // Update progress
      progress[`iter_${iter}_exit`] = result.exitCode;
      fs.writeFileSync(progressFile, JSON.stringify(progress, null, 2));
    }

    // Save iteration output
    fs.writeFileSync(
      path.join(ctx.artifactsDir, `loop-iter-${iter}.md`),
      output
    );
  }

  sseEmit(res, "error", `[LOOP] Max iterations (${maxIter}) reached without completion token`, nodeId);
}

// ─── APPROVAL GATE ────────────────────────────────────────────────────────────

async function runApproval(
  approvalConfig: NonNullable<WorkflowNode["approval"]>,
  ctx: RunContext,
  res: Response,
  nodeId: string
): Promise<{ approved: boolean; feedback?: string }> {
  sseInfo(res, `[APPROVAL] Waiting for user approval...`, nodeId);

  // Emit approval event to UI
  const data = JSON.stringify({
    type: "approval",
    nodeId,
    message: approvalConfig.message,
    runId: ctx.runId,
    ts: new Date().toISOString(),
  });
  res.write(`event: approval\ndata: ${data}\n\n`);

  // Wait for resume signal
  return new Promise((resolve) => {
    pendingApprovals.set(ctx.runId, (approved, feedback) => {
      pendingApprovals.delete(ctx.runId);
      resolve({ approved, feedback });
    });

    // Timeout after 10 minutes
    setTimeout(() => {
      if (pendingApprovals.has(ctx.runId)) {
        pendingApprovals.delete(ctx.runId);
        resolve({ approved: false, feedback: "Approval timeout (10 min)" });
      }
    }, 10 * 60 * 1000);
  });
}

// ─── WORKFLOW LOADER ──────────────────────────────────────────────────────────

export function loadWorkflow(name: string): Workflow | null {
  const file = path.join(WORKFLOWS_DIR, `${name}.yaml`);
  if (!fs.existsSync(file)) return null;
  return yaml.load(fs.readFileSync(file, "utf-8")) as Workflow;
}

export function listWorkflows(): string[] {
  if (!fs.existsSync(WORKFLOWS_DIR)) return [];
  return fs.readdirSync(WORKFLOWS_DIR)
    .filter(f => f.endsWith(".yaml"))
    .map(f => f.replace(".yaml", ""));
}

// ─── MAIN RUNNER ─────────────────────────────────────────────────────────────

export async function runWorkflow(
  workflowName: string,
  userMessage: string,
  res: Response
): Promise<void> {
  const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // Setup artifacts directory
  const artifactsDir = path.join(ARTIFACTS_BASE, runId);
  fs.mkdirSync(artifactsDir, { recursive: true });

  const ctx: RunContext = {
    runId,
    workflowName,
    userMessage,
    artifactsDir,
    repoRoot: REPO_ROOT,
    env: {
      USER_MESSAGE: userMessage,
      ARTIFACTS_DIR: artifactsDir,
      RUN_ID: runId,
    },
  };

  // Load workflow
  const workflow = loadWorkflow(workflowName);
  if (!workflow) {
    sseError(res, `Workflow not found: ${workflowName}`);
    sseDone(res, "FAILED: workflow not found");
    return;
  }

  sseInfo(res, `[ARCHON] Starting workflow: ${workflow.name}`);
  sseInfo(res, `[ARCHON] Run ID: ${runId}`);
  sseInfo(res, `[ARCHON] Message: ${userMessage}`);
  sseInfo(res, `[ARCHON] Artifacts: ${artifactsDir}`);

  // Save run metadata
  fs.writeFileSync(path.join(artifactsDir, "run.json"), JSON.stringify({
    runId, workflowName, userMessage, startedAt: new Date().toISOString()
  }, null, 2));

  // Execute nodes in dependency order
  const completed = new Set<string>();
  const nodeOutputs: Record<string, string> = {};

  for (const node of workflow.nodes) {
    // Wait for dependencies
    if (node.depends_on) {
      const missing = node.depends_on.filter(d => !completed.has(d));
      if (missing.length > 0) {
        sseError(res, `Node ${node.id} dependencies not met: ${missing.join(", ")}`);
        continue;
      }
    }

    sseInfo(res, `\n[NODE] ${node.id}${node.description ? ` — ${node.description}` : ""}`, node.id);

    try {
      if (node.bash) {
        // Substitute variables
        const cmd = node.bash
          .replace(/\$USER_MESSAGE/g, userMessage)
          .replace(/\$ARTIFACTS_DIR/g, artifactsDir);

        const result = await runBashWithHealing(cmd, ctx, res, node.id);
        nodeOutputs[node.id] = result.stdout;

        if (result.exitCode !== 0) {
          sseError(res, `Node ${node.id} failed with exit code ${result.exitCode}`, node.id);
          sseDone(res, `FAILED at node: ${node.id}`);
          return;
        }

      } else if (node.command) {
        const prevOutput = node.depends_on
          ? node.depends_on.map(d => nodeOutputs[d] ?? "").join("\n\n")
          : "";
        const output = await runCommand(node.command, ctx, res, node.id, prevOutput);
        nodeOutputs[node.id] = output;

      } else if (node.loop) {
        await runLoop(node.loop, ctx, res, node.id);
        nodeOutputs[node.id] = "loop_complete";

      } else if (node.approval) {
        const { approved, feedback } = await runApproval(node.approval, ctx, res, node.id);
        if (!approved) {
          sseInfo(res, `[APPROVAL] Rejected: ${feedback ?? "no reason given"}`, node.id);

          // Handle rejection
          if (node.approval.on_reject) {
            sseInfo(res, `[APPROVAL] Running rejection handler...`, node.id);
            const rejectPrompt = node.approval.on_reject.prompt
              .replace(/\$REJECTION_REASON/g, feedback ?? "");
            const fixedOutput = await callLLM(rejectPrompt);
            nodeOutputs[node.id] = fixedOutput;
            sseEmit(res, "stdout", fixedOutput.slice(0, 500), node.id);
          } else {
            sseDone(res, "STOPPED: user rejected plan");
            return;
          }
        } else {
          sseInfo(res, `[APPROVAL] Approved!`, node.id);
          nodeOutputs[node.id] = feedback ?? "approved";
        }
      }

      completed.add(node.id);

    } catch (err) {
      sseError(res, `Node ${node.id} threw: ${err}`, node.id);
      sseDone(res, `FAILED at node: ${node.id}`);
      return;
    }
  }

  // Save final summary
  const summary = {
    runId,
    workflowName,
    userMessage,
    completedNodes: [...completed],
    artifactsDir,
    completedAt: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(artifactsDir, "summary.json"), JSON.stringify(summary, null, 2));

  sseInfo(res, `\n[ARCHON] Workflow complete. ${completed.size}/${workflow.nodes.length} nodes executed.`);
  sseDone(res, `SUCCESS: ${workflowName} complete. Run ID: ${runId}`);
}

// ─── APPROVAL RESUME ─────────────────────────────────────────────────────────

export function resumeApproval(runId: string, approved: boolean, feedback?: string): boolean {
  const resolver = pendingApprovals.get(runId);
  if (!resolver) return false;
  resolver(approved, feedback);
  return true;
}
