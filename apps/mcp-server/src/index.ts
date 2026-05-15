import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import cors from "cors";
import { registry } from "./registry.js";

// Import all tool groups
import { workspaceTools } from "./tools/workspace.js";
import { advocacyOrgTools } from "./tools/advocacy-org.js";
import { campaignTools } from "./tools/campaign.js";
import { initiativeTools } from "./tools/initiative.js";
import { taskTools } from "./tools/task.js";
import { evidenceTools } from "./tools/evidence.js";
import { clinicalTrialTools } from "./tools/clinical-trial.js";
import { biomarkerTools } from "./tools/biomarker.js";
import { patientStoryTools } from "./tools/patient-story.js";
import { coalitionTools } from "./tools/coalition.js";
import { searchTools } from "./tools/search.js";
import { userTools } from "./tools/user.js";

// ─── Register all tools ───────────────────────────────────────────────────────

registry.registerAll([
  ...workspaceTools,
  ...advocacyOrgTools,
  ...campaignTools,
  ...initiativeTools,
  ...taskTools,
  ...evidenceTools,
  ...clinicalTrialTools,
  ...biomarkerTools,
  ...patientStoryTools,
  ...coalitionTools,
  ...searchTools,
  ...userTools,
]);

console.log(`[CAID MCP] Registered ${registry.size} tools`);

// ─── Transport selection ──────────────────────────────────────────────────────

const transport = process.argv.includes("--transport")
  ? process.argv[process.argv.indexOf("--transport") + 1]
  : process.env.MCP_TRANSPORT ?? "http";

if (transport === "stdio") {
  // STDIO transport — for Cursor / Claude Desktop
  const server = new Server(
    { name: "zeta-caid", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );
  registry.wireToServer(server);
  const stdioTransport = new StdioServerTransport();
  await server.connect(stdioTransport);
  console.error("[CAID MCP] Running on STDIO");
} else {
  // HTTP transport — for Render deployment + remote agents
  const app = express();
  app.use(cors());
  app.use(express.json());

  // Auth middleware
  app.use("/mcp", (req, res, next) => {
    const token = req.headers.authorization?.replace("Bearer ", "");
    const expected = process.env.MCP_AUTH_TOKEN;
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
      tools: registry.size,
      version: "1.0.0",
      service: "zeta-caid-mcp",
    });
  });

  // Tool list endpoint (for quick inspection)
  app.get("/tools", (_req, res) => {
    res.json({
      tools: registry.getAll().map((t) => ({ name: t.name, description: t.description })),
    });
  });

  // MCP HTTP endpoint
  app.all("/mcp", async (req, res) => {
    const server = new Server(
      { name: "zeta-caid", version: "1.0.0" },
      { capabilities: { tools: {} } }
    );
    registry.wireToServer(server);

    const httpTransport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    await server.connect(httpTransport);
    await httpTransport.handleRequest(req, res, req.body);
  });

  const port = parseInt(process.env.PORT ?? "3001", 10);
  app.listen(port, () => {
    console.log(`[CAID MCP] HTTP server running on port ${port}`);
    console.log(`[CAID MCP] ${registry.size} tools available`);
    console.log(`[CAID MCP] Health: http://localhost:${port}/health`);
    console.log(`[CAID MCP] Tools:  http://localhost:${port}/tools`);

    // ── Keep-alive: self-ping every 9 min to prevent Render free-tier sleep ──
    const PING_INTERVAL_MS = 9 * 60 * 1000; // 9 minutes
    const selfUrl = `http://localhost:${port}/health`;
    setInterval(async () => {
      try {
        const res = await fetch(selfUrl);
        console.log(`[CAID MCP] keep-alive ping → ${res.status}`);
      } catch (err) {
        console.warn(`[CAID MCP] keep-alive ping failed: ${err}`);
      }
    }, PING_INTERVAL_MS);
    console.log(`[CAID MCP] Keep-alive enabled (ping every 9 min)`);
  });
}
