/**
 * toolAuditHook — wraps MCPClient.callTool() to emit PreToolUse / PostToolUse
 * audit records into AgentMessage and AuditLog tables.
 *
 * Usage:
 *   import { wrapMCPClientWithAudit, runWithAuditContext } from "./hooks/toolAuditHook.js";
 *   wrapMCPClientWithAudit(mcpClient, prisma);
 *
 *   // In runAgentAsync, wrap the agent.invoke() call:
 *   await runWithAuditContext({ agentRunId, workspaceId }, () => agent.invoke(...));
 *
 * Uses AsyncLocalStorage so concurrent agent runs are correctly isolated —
 * each tool call is attributed to the run that triggered it even when multiple
 * runs execute simultaneously.
 *
 * Audit records written per tool call:
 *   AgentMessage  role="tool", toolName, toolInput (Json), toolOutput (Json)
 *   AuditLog      action="tool.<name>.success|error", entityType="tool"
 *
 * Both writes are fire-and-forget (non-blocking) so they never slow down the
 * agent's hot path. Errors in audit writes are logged but never re-thrown.
 */

import { AsyncLocalStorage } from "node:async_hooks";
import type { PrismaClient } from "@zeta/db";
import { Prisma } from "@zeta/db";
import type { MCPClient } from "../mcp-client.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AuditContext {
  agentRunId: string;
  workspaceId: string;
  /** Optional: Clerk user ID of the human who triggered the run */
  userId?: string | null;
}

// ─── AsyncLocalStorage store ──────────────────────────────────────────────────

const auditStore = new AsyncLocalStorage<AuditContext>();

/**
 * Run `fn` with the given audit context active for the entire async call tree.
 * Any callTool() invocations inside fn (including those triggered by LangGraph
 * nodes) will automatically pick up this context.
 */
export async function runWithAuditContext<T>(
  ctx: AuditContext,
  fn: () => Promise<T>
): Promise<T> {
  return auditStore.run(ctx, fn);
}

// ─── Message order counter ────────────────────────────────────────────────────
// AgentMessage.order must be monotonically increasing per run.
// Tool messages start at 1000 to avoid collisions with LLM messages
// (which are written in a batch at run end, starting at 0).

const orderCounters = new Map<string, number>();

function nextOrder(runId: string): number {
  const current = orderCounters.get(runId) ?? 1000;
  orderCounters.set(runId, current + 1);
  return current;
}

/** Call when a run completes to free memory. */
export function clearOrderCounter(runId: string): void {
  orderCounters.delete(runId);
}

// ─── JSON helper ─────────────────────────────────────────────────────────────
// Prisma's Json fields require Prisma.InputJsonValue, not plain objects.
// Serialising through JSON.parse(JSON.stringify()) produces a value that
// satisfies the type and strips any non-serialisable values (undefined, etc.).

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

// ─── Core hook ────────────────────────────────────────────────────────────────

/**
 * Patch mcpClient.callTool in-place to emit audit records on every call.
 * Idempotent — calling it twice on the same client is a no-op.
 */
export function wrapMCPClientWithAudit(
  mcpClient: MCPClient,
  prisma: PrismaClient
): void {
  const original = mcpClient.callTool.bind(mcpClient);

  // Guard against double-wrapping
  if ((original as unknown as { __auditWrapped?: boolean }).__auditWrapped) {
    return;
  }

  const wrapped = async function callToolWithAudit(
    name: string,
    args: Record<string, unknown>
  ): Promise<string> {
    const startMs = Date.now();

    // Retrieve context from the async call tree
    const ctx = auditStore.getStore();

    // ── PreToolUse ──────────────────────────────────────────────────────────
    if (ctx) {
      const order = nextOrder(ctx.agentRunId);
      void prisma.agentMessage
        .create({
          data: {
            runId: ctx.agentRunId,
            role: "tool",
            content: `[PreToolUse] ${name}`,
            toolName: name,
            toolInput: toJson(args),
            order,
          },
        })
        .catch((err: unknown) =>
          console.error("[toolAuditHook] PreToolUse write failed:", err)
        );
    }

    // ── Actual tool call ────────────────────────────────────────────────────
    let result: string;
    let callError: Error | null = null;

    try {
      result = await original(name, args);
    } catch (err) {
      callError = err instanceof Error ? err : new Error(String(err));
      result = `Error: ${callError.message}`;
    }

    const durationMs = Date.now() - startMs;

    // ── PostToolUse ─────────────────────────────────────────────────────────
    if (ctx) {
      const action = callError
        ? `tool.${name}.error`
        : `tool.${name}.success`;

      const outputPreview =
        result.length > 2000 ? result.slice(0, 2000) + "…[truncated]" : result;

      const order = nextOrder(ctx.agentRunId);
      void prisma.agentMessage
        .create({
          data: {
            runId: ctx.agentRunId,
            role: "tool",
            content: outputPreview,
            toolName: name,
            toolInput: toJson(args),
            toolOutput: toJson({
              result: outputPreview,
              durationMs,
              error: callError?.message ?? null,
            }),
            order,
          },
        })
        .catch((err: unknown) =>
          console.error("[toolAuditHook] PostToolUse AgentMessage write failed:", err)
        );

      void prisma.auditLog
        .create({
          data: {
            workspaceId: ctx.workspaceId,
            userId: ctx.userId ?? null,
            action,
            entityType: "tool",
            entityId: name,
            before: Prisma.JsonNull,
            after: toJson({
              toolInput: args,
              durationMs,
              outputPreview,
              error: callError?.message ?? null,
            }),
          },
        })
        .catch((err: unknown) =>
          console.error("[toolAuditHook] PostToolUse AuditLog write failed:", err)
        );
    }

    if (callError) throw callError;
    return result;
  };

  (wrapped as unknown as { __auditWrapped: boolean }).__auditWrapped = true;
  mcpClient.callTool = wrapped as typeof mcpClient.callTool;

  console.log("[toolAuditHook] MCPClient.callTool patched with audit hook");
}
