import { NextRequest, NextResponse } from "next/server";
import { resolveWorkspaceId, agentApiUrl } from "@/lib/workspace";

export const dynamic = "force-dynamic";

/**
 * POST /api/caid/kb/search  { query, orgId?, k?, workspaceSlug? }
 *   → semantic (pgvector cosine) search over knowledge chunks via agent-api.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { query, orgId, k, workspaceSlug } = body as {
      query?: string;
      orgId?: string;
      k?: number;
      workspaceSlug?: string;
    };
    if (!query) {
      return NextResponse.json({ error: "query required" }, { status: 400 });
    }
    const workspaceId = await resolveWorkspaceId(workspaceSlug);

    const res = await fetch(`${agentApiUrl()}/api/kb/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId, query, orgId: orgId || undefined, k }),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error("[/api/caid/kb/search] Error:", err);
    return NextResponse.json(
      { error: "Search failed — knowledge service unavailable", hits: [] },
      { status: 502 }
    );
  }
}
