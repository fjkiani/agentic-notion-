import { NextRequest, NextResponse } from "next/server";
import { resolveWorkspaceId, agentApiUrl } from "@/lib/workspace";

export const dynamic = "force-dynamic";

/**
 * GET    /api/caid/kb/:id                       → single doc status/detail
 * DELETE /api/caid/kb/:id?workspaceSlug=        → delete doc + chunks
 */

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const res = await fetch(`${agentApiUrl()}/api/kb/docs/${id}`, {
      cache: "no-store",
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error("[/api/caid/kb/:id GET] Error:", err);
    return NextResponse.json({ error: "Knowledge service unavailable" }, { status: 502 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const workspaceId = await resolveWorkspaceId(
    request.nextUrl.searchParams.get("workspaceSlug")
  );
  try {
    const res = await fetch(
      `${agentApiUrl()}/api/kb/docs/${id}?workspaceId=${workspaceId}`,
      { method: "DELETE" }
    );
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error("[/api/caid/kb/:id DELETE] Error:", err);
    return NextResponse.json({ error: "Knowledge service unavailable" }, { status: 502 });
  }
}
