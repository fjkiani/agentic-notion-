/**
 * Server-side MCP client for Next.js Server Components and API routes.
 * Handles the MCP HTTP transport which returns either JSON or SSE (text/event-stream).
 */

interface MCPResponse {
  result?: { content: Array<{ text: string }>; isError?: boolean };
  error?: { message: string };
  jsonrpc?: string;
  id?: number | null;
}

/**
 * Parse MCP response body — handles both plain JSON and SSE (event-stream) format.
 * The Streamable HTTP transport may return:
 *   - Plain JSON: {"result":...,"jsonrpc":"2.0","id":1}
 *   - SSE:        event: message\ndata: {"result":...}\n\n
 */
function parseMCPBody(raw: string): MCPResponse {
  const trimmed = raw.trim();

  // SSE format: lines starting with "data: "
  if (trimmed.startsWith("event:") || trimmed.startsWith("data:")) {
    for (const line of trimmed.split("\n")) {
      if (line.startsWith("data: ")) {
        try {
          return JSON.parse(line.slice(6)) as MCPResponse;
        } catch {
          // continue to next line
        }
      }
    }
    throw new Error("Could not parse SSE response from MCP server");
  }

  // Plain JSON
  return JSON.parse(trimmed) as MCPResponse;
}

export async function callMCPServer<T = unknown>(
  toolName: string,
  args: Record<string, unknown>
): Promise<T> {
  const MCP_URL =
    process.env.NEXT_PUBLIC_MCP_SERVER_URL ??
    "https://agentic-notion-mcp.onrender.com";
  const MCP_TOKEN = process.env.MCP_AUTH_TOKEN ?? "";

  const res = await fetch(`${MCP_URL}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json, text/event-stream",
      "Authorization": `Bearer ${MCP_TOKEN}`,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(),
      method: "tools/call",
      params: { name: toolName, arguments: args },
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`MCP server returned ${res.status} for tool: ${toolName}`);
  }

  const raw = await res.text();
  const data = parseMCPBody(raw);

  if (data.error) {
    throw new Error(`MCP tool error (${toolName}): ${data.error.message}`);
  }
  if (data.result?.isError) {
    throw new Error(
      `MCP tool failed (${toolName}): ${data.result.content[0]?.text ?? "unknown error"}`
    );
  }

  const text = data.result?.content[0]?.text ?? "{}";
  return JSON.parse(text) as T;
}
