import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

interface Workspace {
  id: string;
  name: string;
  slug: string;
  description?: string;
}

interface WorkspaceListResponse {
  workspaces: Workspace[];
  total: number;
}

async function callMCP<T>(toolName: string, args: Record<string, unknown>): Promise<T> {
  const MCP_URL = process.env.NEXT_PUBLIC_MCP_SERVER_URL ?? "https://agentic-notion-mcp.onrender.com";
  const MCP_TOKEN = process.env.MCP_AUTH_TOKEN ?? "";

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
    cache: "no-store",
  });

  if (!res.ok) throw new Error(`MCP call failed: ${res.status}`);
  const data = await res.json() as {
    result?: { content: Array<{ text: string }>; isError?: boolean };
    error?: { message: string };
  };
  if (data.error) throw new Error(data.error.message);
  const text = data.result?.content[0]?.text ?? "{}";
  return JSON.parse(text) as T;
}

export async function GET(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const slug = request.nextUrl.searchParams.get("slug");
  if (!slug) return NextResponse.json({ error: "slug required" }, { status: 400 });

  try {
    const result = await callMCP<WorkspaceListResponse>("workspace_list", {});
    const workspace = result.workspaces.find((w) => w.slug === slug);
    if (!workspace) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(workspace);
  } catch (err) {
    console.error("[/api/workspace] Error:", err);
    return NextResponse.json({ error: "Failed to fetch workspace" }, { status: 500 });
  }
}
