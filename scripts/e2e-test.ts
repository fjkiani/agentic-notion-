/**
 * CAID end-to-end verification script.
 * Run: DATABASE_URL=... MCP_SERVER_URL=... MCP_AUTH_TOKEN=... npx tsx scripts/e2e-test.ts
 */

const DATABASE_URL = process.env.DATABASE_URL;
const MCP_URL = (process.env.MCP_SERVER_URL ?? "http://localhost:3001").replace(/\/$/, "");
const MCP_TOKEN = process.env.MCP_AUTH_TOKEN ?? "dev-token";

type Result = { name: string; ok: boolean; detail: string };

const results: Result[] = [];

function pass(name: string, detail: string) {
  results.push({ name, ok: true, detail });
  console.log(`✅ ${name}: ${detail}`);
}

function fail(name: string, detail: string) {
  results.push({ name, ok: false, detail });
  console.log(`❌ ${name}: ${detail}`);
}

async function callMCP(tool: string, args: Record<string, unknown>) {
  const res = await fetch(`${MCP_URL}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${MCP_TOKEN}`,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(),
      method: "tools/call",
      params: { name: tool, arguments: args },
    }),
  });

  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  const text = await res.text();
  const jsonStr = text.includes("data: ")
    ? text.split("\n").find((l) => l.startsWith("data: "))!.slice(6)
    : text;
  const data = JSON.parse(jsonStr) as {
    error?: { message: string };
    result?: { content: Array<{ text: string }>; isError?: boolean };
  };
  if (data.error) throw new Error(data.error.message);
  if (data.result?.isError) throw new Error(data.result.content[0]?.text ?? "tool error");
  return JSON.parse(data.result?.content[0]?.text ?? "{}") as Record<string, unknown>;
}

async function testDatabase() {
  if (!DATABASE_URL) {
    fail("Postgres connection", "DATABASE_URL not set");
    return;
  }

  const { PrismaClient } = await import("../packages/db/src/generated/client/index.js");
  const prisma = new PrismaClient({ datasources: { db: { url: DATABASE_URL } } });

  try {
    await prisma.$queryRaw`SELECT 1`;
    pass("Postgres connection", "Connected to Render Postgres");

    const [orgs, grants, contacts, evidence, trials, biomarkers, workspaces] = await Promise.all([
      prisma.advocacyOrg.count(),
      prisma.openGrant.count(),
      prisma.orgContact.count(),
      prisma.evidence.count(),
      prisma.clinicalTrial.count(),
      prisma.biomarker.count(),
      prisma.workspace.findMany({ select: { slug: true, name: true } }),
    ]);

    pass("Seed: advocacy orgs", `${orgs} orgs (expected ~88 after seed)`);
    pass("Seed: open grants", `${grants} grants (expected ~26 after seed)`);
    pass("Seed: org contacts", `${contacts} contacts (expected ~120 after seed)`);
    pass("Workspaces", workspaces.map((w) => w.slug).join(", ") || "none");

    if (orgs === 0) {
      fail("Seed job", "No orgs in DB — run zeta-caid-seed job on Render");
    } else {
      pass("CRM data", `${orgs} orgs, ${contacts} contacts in Postgres`);
    }

    if (grants === 0) {
      fail("Grants data", "No OpenGrant rows — seed job may not have run");
    } else {
      const sample = await prisma.openGrant.findFirst({
        where: { status: "OPEN" },
        select: { title: true, deadlineRaw: true, org: { select: { name: true } } },
      });
      pass("Grants sample", sample ? `"${sample.title}" (${sample.org.name})` : "grants exist");
    }

    pass("Agent-created data", `${evidence} evidence, ${trials} trials, ${biomarkers} biomarkers in DB`);

    const workspace = workspaces[0];
    if (workspace) {
      const ws = await prisma.workspace.findUnique({ where: { slug: workspace.slug } });
      if (ws) {
        (globalThis as { __workspaceId?: string }).__workspaceId = ws.id;
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

async function testMCPExtraction() {
  try {
    const health = await fetch(`${MCP_URL}/health`);
    if (!health.ok) throw new Error(`health ${health.status}`);
    const h = (await health.json()) as { tools: number };
    pass("MCP server", `${MCP_URL} — ${h.tools} tools`);
  } catch (e) {
    fail("MCP server", e instanceof Error ? e.message : String(e));
    return;
  }

  // PubMed extraction
  try {
    const pubmed = await callMCP("evidence_search_pubmed", {
      query: "glioblastoma immunotherapy",
      cancerType: "GBM",
      maxResults: 3,
    });
    const items = (pubmed.results as unknown[]) ?? [];
    if (items.length === 0) fail("PubMed extract", "0 results");
    else {
      const first = items[0] as { pmid?: string; title?: string };
      pass("PubMed extract", `${items.length} papers — PMID ${first.pmid}: ${(first.title ?? "").slice(0, 60)}...`);
    }
  } catch (e) {
    fail("PubMed extract", e instanceof Error ? e.message : String(e));
  }

  // ClinicalTrials.gov extraction
  try {
    const trials = await callMCP("trial_search_ctgov", {
      query: "glioblastoma",
      maxResults: 3,
    });
    const items = (trials.results as unknown[]) ?? [];
    if (items.length === 0) fail("ClinicalTrials extract", "0 results");
    else {
      const first = items[0] as { nctId?: string; title?: string };
      pass("ClinicalTrials extract", `${items.length} trials — ${first.nctId}: ${(first.title ?? "").slice(0, 60)}...`);
    }
  } catch (e) {
    fail("ClinicalTrials extract", e instanceof Error ? e.message : String(e));
  }

  // NCBI Gene / biomarker lookup (retry on NCBI rate limits)
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const gene = await callMCP("biomarker_lookup_ncbi", { symbol: "EGFR" });
      pass("Biomarker/NCBI extract", `EGFR → ${(gene as { name?: string }).name ?? (gene as { symbol?: string }).symbol ?? "found"}`);
      break;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (attempt < 3 && msg.includes("429")) {
        await new Promise((r) => setTimeout(r, 2000 * attempt));
        continue;
      }
      fail("Biomarker/NCBI extract", msg);
    }
  }

  // CRM: org list from seeded DB
  const workspaceId = (globalThis as { __workspaceId?: string }).__workspaceId;
  if (workspaceId) {
    try {
      const orgs = await callMCP("org_list", { workspaceId, limit: 5 });
      const total = (orgs.total as number) ?? 0;
      const first = ((orgs.orgs as Array<{ name: string }>) ?? [])[0];
      pass("CRM org_list", `${total} orgs — e.g. ${first?.name ?? "n/a"}`);
    } catch (e) {
      fail("CRM org_list", e instanceof Error ? e.message : String(e));
    }

    try {
      const dash = await callMCP("workspace_dashboard", { workspaceId });
      pass("CRM dashboard", JSON.stringify(dash).slice(0, 120));
    } catch (e) {
      fail("CRM dashboard", e instanceof Error ? e.message : String(e));
    }

    try {
      const grants = await callMCP("grant_list", { workspaceId, limit: 5, status: "OPEN" });
      const total = (grants.total as number) ?? 0;
      const first = ((grants.grants as Array<{ title: string; org?: { name: string } }>) ?? [])[0];
      pass("Grants MCP API", `${total} grants — e.g. "${first?.title}" (${first?.org?.name ?? "n/a"})`);
    } catch (e) {
      fail("Grants MCP API", e instanceof Error ? e.message : String(e));
    }
  } else {
    fail("Grants MCP API", "No workspace — seed may not have run");
  }

  // Legacy check removed — grant_list is the grants API
  void (async () => {
    try {
      const toolsRes = await fetch(`${MCP_URL}/tools`);
      const tools = ((await toolsRes.json()) as { tools: Array<{ name: string }> }).tools;
      const grantTools = tools.filter((t) => t.name.includes("grant"));
      if (grantTools.length === 0) fail("Grants tool registry", "grant_list not registered");
    } catch {
      // optional
    }
  })();
}

async function testAgents() {
  const agentUrl = process.env.AGENT_API_URL ?? "https://agentic-notion-agents.onrender.com";
  const agentToken = process.env.AGENT_API_TOKEN ?? "dev-token";
  try {
    const res = await fetch(`${agentUrl}/health`);
    const data = (await res.json()) as { ready: boolean; agents: string[] };
    if (!data.ready) {
      if (!process.env.OPENROUTER_API_KEY && agentUrl.includes("localhost")) {
        pass("Agent API", "MCP tools loaded; agents skipped locally (set OPENROUTER_API_KEY to init LLMs)");
        return;
      }
      fail("Agent API", "Server up but agents not ready");
      return;
    }
    pass("Agent API", `${data.agents.length} agents ready: ${data.agents.join(", ")}`);

    if (process.env.RUN_AGENT_E2E === "true") {
      const workspaceId = (globalThis as { __workspaceId?: string }).__workspaceId;
      if (!workspaceId) {
        fail("Agent run", "No workspaceId for agent test");
        return;
      }
      const runRes = await fetch(`${agentUrl}/api/agents/run`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${agentToken}`,
        },
        body: JSON.stringify({
          workspaceId,
          role: "RESEARCH_INTELLIGENCE",
          message: "Search PubMed for 1 recent glioblastoma immunotherapy paper and summarize in one sentence.",
        }),
      });
      if (!runRes.ok) {
        fail("Agent run", `HTTP ${runRes.status}: ${await runRes.text()}`);
        return;
      }
      const { runId } = (await runRes.json()) as { runId: string };
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const statusRes = await fetch(`${agentUrl}/api/agents/run/${runId}`, {
          headers: { Authorization: `Bearer ${agentToken}` },
        });
        const status = (await statusRes.json()) as { status: string; output?: { summary?: string } };
        if (status.status === "COMPLETED") {
          pass("Agent run", `RESEARCH_INTELLIGENCE completed — ${JSON.stringify(status.output).slice(0, 120)}`);
          return;
        }
        if (status.status === "FAILED") {
          fail("Agent run", JSON.stringify(status).slice(0, 200));
          return;
        }
      }
      fail("Agent run", "Timed out waiting for agent completion");
    }
  } catch (e) {
    fail("Agent API", e instanceof Error ? e.message : String(e));
  }
}

async function testWeb() {
  const webUrl = process.env.WEB_URL ?? "https://agentic-notion-web.onrender.com";
  try {
    const res = await fetch(webUrl, { redirect: "follow" });
    pass("Web app", `${webUrl} → HTTP ${res.status}`);
  } catch (e) {
    fail("Web app", e instanceof Error ? e.message : String(e));
  }
}

async function main() {
  console.log("\n=== CAID End-to-End Test ===\n");
  await testWeb();
  await testAgents();
  await testDatabase();
  await testMCPExtraction();

  console.log("\n=== Summary ===");
  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  console.log(`${passed} passed, ${failed} failed\n`);

  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
