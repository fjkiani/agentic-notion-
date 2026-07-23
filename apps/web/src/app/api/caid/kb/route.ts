import { NextRequest, NextResponse } from "next/server";
import { resolveWorkspaceId, agentApiUrl } from "@/lib/workspace";

export const dynamic = "force-dynamic";

/**
 * GET  /api/caid/kb?workspaceSlug=&orgId=   → list knowledge docs
 * POST /api/caid/kb   (multipart: file, title?, orgId?, grantId?, tags?, workspaceSlug?)
 *      → forward upload to agent-api, which extracts + chunks + embeds async
 */

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const workspaceId = await resolveWorkspaceId(searchParams.get("workspaceSlug"));
  const orgId = searchParams.get("orgId");

  const qs = new URLSearchParams({ workspaceId });
  if (orgId) qs.set("orgId", orgId);

  try {
    const res = await fetch(`${agentApiUrl()}/api/kb/docs?${qs}`, {
      cache: "no-store",
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error("[/api/caid/kb GET] Error:", err);
    return NextResponse.json(
      { error: "Knowledge service unavailable", docs: [] },
      { status: 502 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const inForm = await request.formData();
    const workspaceSlug = (inForm.get("workspaceSlug") as string) || null;
    const workspaceId = await resolveWorkspaceId(workspaceSlug);

    // Rebuild multipart body for agent-api with the resolved workspaceId.
    const outForm = new FormData();
    const file = inForm.get("file");
    if (!file) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }
    outForm.set("file", file as Blob, (file as File).name);
    outForm.set("workspaceId", workspaceId);
    for (const key of ["title", "orgId", "grantId", "tags"]) {
      const v = inForm.get(key);
      if (v) outForm.set(key, v as string);
    }

    const res = await fetch(`${agentApiUrl()}/api/kb/upload`, {
      method: "POST",
      body: outForm,
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error("[/api/caid/kb POST] Error:", err);
    return NextResponse.json(
      { error: "Upload failed — knowledge service unavailable" },
      { status: 502 }
    );
  }
}
