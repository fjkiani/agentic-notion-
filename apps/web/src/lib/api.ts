// ─── MCP Client (web → MCP server) ───────────────────────────────────────────

const MCP_URL = process.env.NEXT_PUBLIC_MCP_SERVER_URL ?? "http://localhost:3001";
const MCP_TOKEN = process.env.MCP_AUTH_TOKEN ?? "dev-token";

export async function callMCPTool<T = unknown>(
  toolName: string,
  args: Record<string, unknown>
): Promise<T> {
  const res = await fetch(`${MCP_URL}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${MCP_TOKEN}`,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(),
      method: "tools/call",
      params: { name: toolName, arguments: args },
    }),
  });

  if (!res.ok) throw new Error(`MCP call failed: ${res.status}`);

  const data = await res.json() as {
    result?: { content: Array<{ text: string }>; isError?: boolean };
    error?: { message: string };
  };

  if (data.error) throw new Error(data.error.message);
  if (data.result?.isError) throw new Error(data.result.content[0]?.text ?? "Tool error");

  const text = data.result?.content[0]?.text ?? "{}";
  return JSON.parse(text) as T;
}

// ─── Agent API Client (web → Agent API) ──────────────────────────────────────

const AGENT_URL = process.env.NEXT_PUBLIC_AGENT_API_URL ?? "http://localhost:3002";
const AGENT_TOKEN = process.env.AGENT_API_TOKEN ?? "dev-token";

export async function startAgentRun(params: {
  workspaceId: string;
  role: string;
  message: string;
  context?: { orgId?: string; campaignId?: string; initiativeId?: string };
  userId?: string;
}): Promise<{ runId: string; status: string }> {
  const res = await fetch(`${AGENT_URL}/api/agents/run`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${AGENT_TOKEN}`,
      ...(params.userId ? { "x-user-id": params.userId } : {}),
    },
    body: JSON.stringify(params),
  });

  if (!res.ok) throw new Error(`Agent run failed: ${res.status}`);
  return res.json() as Promise<{ runId: string; status: string }>;
}

export async function getAgentRun(runId: string) {
  const res = await fetch(`${AGENT_URL}/api/agents/run/${runId}`, {
    headers: { "Authorization": `Bearer ${AGENT_TOKEN}` },
  });
  if (!res.ok) throw new Error(`Get run failed: ${res.status}`);
  return res.json();
}

export async function approveAgentRun(runId: string, approved: boolean, feedback?: string) {
  const res = await fetch(`${AGENT_URL}/api/agents/run/${runId}/approve`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${AGENT_TOKEN}`,
    },
    body: JSON.stringify({ approved, feedback }),
  });
  if (!res.ok) throw new Error(`Approve run failed: ${res.status}`);
  return res.json();
}

export function streamAgentRun(
  runId: string,
  onMessage: (event: { type: string; [key: string]: unknown }) => void,
  onDone: () => void
): () => void {
  const es = new EventSource(`${AGENT_URL}/api/agents/run/${runId}/stream`);

  es.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data as string) as { type: string; [key: string]: unknown };
      onMessage(data);
      if (data.type === "done") {
        es.close();
        onDone();
      }
    } catch { /* ignore parse errors */ }
  };

  es.onerror = () => {
    es.close();
    onDone();
  };

  return () => es.close();
}
