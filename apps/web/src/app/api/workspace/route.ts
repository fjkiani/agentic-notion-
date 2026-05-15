import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { callMCPServer } from "@/lib/mcp-server";

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

export async function GET(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const slug = request.nextUrl.searchParams.get("slug");
  if (!slug) return NextResponse.json({ error: "slug required" }, { status: 400 });

  try {
    const result = await callMCPServer<WorkspaceListResponse>("workspace_list", {});
    const workspace = result.workspaces.find((w) => w.slug === slug);
    if (!workspace) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(workspace);
  } catch (err) {
    console.error("[/api/workspace] Error:", err);
    return NextResponse.json({ error: "Failed to fetch workspace" }, { status: 500 });
  }
}
