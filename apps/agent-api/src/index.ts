import express from "express";
import cors from "cors";
import { HumanMessage } from "@langchain/core/messages";
import { prisma } from "@zeta/db";
import { agentRegistry } from "./agents/registry.js";
import type { AgentRole } from "./agents/registry.js";
import { runWorkflow, listWorkflows, resumeApproval } from "./archon-runner.js";

const app = express();
app.use(cors());
app.use(express.json());

// Auth middleware
app.use("/api", (req, res, next) => {
  const token = req.headers.authorization?.replace("Bearer ", "");
  const expected = process.env.AGENT_API_TOKEN;
  if (expected && token !== expected) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
});

// Health check
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    agents: agentRegistry.getRoles(),
    ready: agentRegistry.isReady(),
    version: "1.0.0",
    service: "zeta-caid-agents",
  });
});

// ─── Start an agent run ───────────────────────────────────────────────────────

app.post("/api/agents/run", async (req, res) => {
  try {
    const { workspaceId, role, message, context } = req.body as {
      workspaceId: string;
      role: AgentRole;
      message: string;
      context?: { orgId?: string; campaignId?: string; initiativeId?: string };
    };

    if (!workspaceId || !role || !message) {
      res.status(400).json({ error: "workspaceId, role, and message are required" });
      return;
    }

    if (!agentRegistry.isReady()) {
      res.status(503).json({ error: "Agents are still initializing. Retry in a few seconds." });
      return;
    }

    // Create agent run record
    const agentRun = await prisma.agentRun.create({
      data: {
        workspaceId,
        userId: (req.headers["x-user-id"] as string) || null,
        role,
        status: "RUNNING",
        input: { message, context },
        model: getModelForRole(role),
      },
    });

    // Run agent asynchronously
    runAgentAsync(agentRun.id, role, workspaceId, message, context).catch(console.error);

    res.json({ runId: agentRun.id, status: "RUNNING" });
  } catch (error) {
    console.error("[Agent API] Start run error:", error);
    res.status(500).json({ error: error instanceof Error ? error.message : "Internal error" });
  }
});

// ─── Get run status ───────────────────────────────────────────────────────────

app.get("/api/agents/run/:id", async (req, res) => {
  try {
    const run = await prisma.agentRun.findUnique({
      where: { id: req.params.id },
      include: {
        messages: { orderBy: { order: "asc" } },
      },
    });
    if (!run) {
      res.status(404).json({ error: "Run not found" });
      return;
    }
    res.json(run);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Internal error" });
  }
});

// ─── Approve a run (resume after interrupt) ───────────────────────────────────

app.post("/api/agents/run/:id/approve", async (req, res) => {
  try {
    const { approved, feedback } = req.body as { approved: boolean; feedback?: string };
    const run = await prisma.agentRun.findUnique({ where: { id: req.params.id } });
    if (!run) {
      res.status(404).json({ error: "Run not found" });
      return;
    }

    if (!approved) {
      await prisma.agentRun.update({
        where: { id: run.id },
        data: { status: "CANCELLED", completedAt: new Date() },
      });
      res.json({ status: "CANCELLED" });
      return;
    }

    // Resume the agent
    const agent = agentRegistry.get(run.role as AgentRole);
    const config = { configurable: { thread_id: run.id } };
    const resumeMessage = feedback ? `Approved. ${feedback}` : "Approved. Please proceed.";

    await agent.invoke(
      { messages: [new HumanMessage(resumeMessage)] },
      config
    );

    res.json({ status: "RESUMED" });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Internal error" });
  }
});

// ─── SSE stream of agent run ──────────────────────────────────────────────────

app.get("/api/agents/run/:id/stream", async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const runId = req.params.id;
  let lastMessageCount = 0;

  const poll = setInterval(async () => {
    try {
      const run = await prisma.agentRun.findUnique({
        where: { id: runId },
        include: { messages: { orderBy: { order: "asc" } } },
      });

      if (!run) {
        res.write(`data: ${JSON.stringify({ type: "error", message: "Run not found" })}\n\n`);
        clearInterval(poll);
        res.end();
        return;
      }

      // Send new messages
      const newMessages = run.messages.slice(lastMessageCount);
      for (const msg of newMessages) {
        res.write(`data: ${JSON.stringify({ type: "message", message: msg })}\n\n`);
      }
      lastMessageCount = run.messages.length;

      // Send status update
      res.write(`data: ${JSON.stringify({ type: "status", status: run.status })}\n\n`);

      if (["COMPLETED", "FAILED", "CANCELLED"].includes(run.status)) {
        res.write(`data: ${JSON.stringify({ type: "done", run })}\n\n`);
        clearInterval(poll);
        res.end();
      }
    } catch (error) {
      console.error("[SSE] Poll error:", error);
    }
  }, 1000);

  req.on("close", () => clearInterval(poll));
});

// ─── List recent runs ─────────────────────────────────────────────────────────

app.get("/api/agents/history", async (req, res) => {
  try {
    const { workspaceId, role, limit = "20" } = req.query as {
      workspaceId?: string; role?: string; limit?: string;
    };
    const where: Record<string, unknown> = {};
    if (workspaceId) where["workspaceId"] = workspaceId;
    if (role) where["role"] = role;

    const runs = await prisma.agentRun.findMany({
      where,
      take: parseInt(limit, 10),
      orderBy: { startedAt: "desc" },
      select: {
        id: true, role: true, status: true, startedAt: true, completedAt: true,
        durationMs: true, model: true, input: true,
        _count: { select: { messages: true } },
      },
    });
    res.json({ runs, total: runs.length });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Internal error" });
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function runAgentAsync(
  runId: string,
  role: AgentRole,
  workspaceId: string,
  message: string,
  context?: { orgId?: string; campaignId?: string; initiativeId?: string }
) {
  const startTime = Date.now();
  try {
    const agent = agentRegistry.get(role);
    const config = { configurable: { thread_id: runId } };

    const initialState = {
      messages: [new HumanMessage(message)],
      workspaceId,
      orgId: context?.orgId,
      campaignId: context?.campaignId,
      initiativeId: context?.initiativeId,
      role,
      agentRunId: runId,
    };

    const result = await agent.invoke(initialState, config);

    // Save messages to DB
    const messages = result.messages ?? [];
    await prisma.$transaction(
      messages.map((msg: { _getType?: () => string; content: unknown; tool_calls?: unknown; additional_kwargs?: { thinking?: string } }, i: number) =>
        prisma.agentMessage.create({
          data: {
            runId,
            role: msg._getType?.() ?? "ai",
            content: typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content),
            thinking: msg.additional_kwargs?.thinking,
            order: i,
          },
        })
      )
    );

    await prisma.agentRun.update({
      where: { id: runId },
      data: {
        status: result.phase === "AWAITING_APPROVAL" ? "AWAITING_APPROVAL" : "COMPLETED",
        output: { finalOutput: result.finalOutput, tasksCreated: result.tasksCreated, evidenceFound: result.evidenceFound },
        graphState: result,
        completedAt: new Date(),
        durationMs: Date.now() - startTime,
      },
    });
  } catch (error) {
    console.error(`[Agent Run ${runId}] Error:`, error);
    await prisma.agentRun.update({
      where: { id: runId },
      data: {
        status: "FAILED",
        errorMessage: error instanceof Error ? error.message : String(error),
        completedAt: new Date(),
        durationMs: Date.now() - startTime,
      },
    });
  }
}

function getModelForRole(role: string): string {
  const models: Record<string, string> = {
    ADVOCACY_PM: "openai/gpt-oss-120b:free",
    RESEARCH_INTELLIGENCE: "openai/gpt-oss-120b:free",
    COALITION_BUILDER: "openai/gpt-oss-120b:free",
    STANDUP_REPORTER: "openai/gpt-oss-20b:free",
  };
  return models[role] ?? "openai/gpt-oss-20b:free";
}


// ─── Archon Workflow Runner ───────────────────────────────────────────────────

// List available workflows
app.get("/api/archon/workflows", (_req, res) => {
  res.json({ workflows: listWorkflows() });
});

// Launch a workflow — SSE stream of real execution logs
app.post("/api/archon/run", (req, res) => {
  const { workflow, message } = req.body as { workflow: string; message: string };

  if (!workflow || !message) {
    res.status(400).json({ error: "workflow and message are required" });
    return;
  }

  // Set SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // Disable nginx buffering

  // Run workflow (async, streams to res)
  runWorkflow(workflow, message, res).catch((err) => {
    console.error("[Archon] Fatal error:", err);
    res.write(`event: log\ndata: ${JSON.stringify({ type: "error", text: String(err), nodeId: "runner" })}\n\n`);
    res.write(`event: done\ndata: ${JSON.stringify({ type: "done", text: "FAILED: " + String(err) })}\n\n`);
    res.end();
  });
});

// Resume an approval gate
app.post("/api/archon/run/:runId/approve", (req, res) => {
  const { runId } = req.params;
  const { approved, feedback } = req.body as { approved: boolean; feedback?: string };

  const ok = resumeApproval(runId, approved, feedback);
  if (!ok) {
    res.status(404).json({ error: "No pending approval for this run ID" });
    return;
  }
  res.json({ status: approved ? "APPROVED" : "REJECTED" });
});

// ─── Start server ─────────────────────────────────────────────────────────────

const port = parseInt(process.env.PORT ?? "3002", 10);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function initializeAgentsWithRetry(): Promise<void> {
  const maxAttempts = 8;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await agentRegistry.initialize();
      console.log(`[CAID Agents] Agents: ${agentRegistry.getRoles().join(", ")}`);
      return;
    } catch (error) {
      console.error(`[CAID Agents] Agent init attempt ${attempt}/${maxAttempts} failed:`, error);
      if (attempt < maxAttempts) {
        const delay = 5000 * attempt;
        console.log(`[CAID Agents] Retrying agent init in ${delay / 1000}s...`);
        await sleep(delay);
      }
    }
  }

  console.error("[CAID Agents] Agents failed to initialize — HTTP server running, will retry on next deploy/restart");
}

// Start HTTP server immediately so Render health checks pass during MCP cold starts
app.listen(port, () => {
  console.log(`[CAID Agents] Server running on port ${port}`);

  void initializeAgentsWithRetry();

  // ── Keep-alive: self-ping every 9 min to prevent Render free-tier sleep ──
  const PING_INTERVAL_MS = 9 * 60 * 1000;
  const selfUrl = `http://localhost:${port}/health`;
  setInterval(async () => {
    try {
      const res = await fetch(selfUrl);
      console.log(`[CAID Agents] keep-alive ping → ${res.status}`);
    } catch (err) {
      console.warn(`[CAID Agents] keep-alive ping failed: ${err}`);
    }
  }, PING_INTERVAL_MS);
  console.log(`[CAID Agents] Keep-alive enabled (ping every 9 min)`);
});
