/**
 * Server-side workspace resolution for Next.js API routes.
 *
 * The CAID deployment is effectively single-workspace, but pages carry a
 * `workspaceSlug` route param. This helper resolves that slug to a workspace id,
 * falling back to the first (oldest) workspace when the slug is missing or
 * unknown — which keeps the KB/outreach routes working in the keyless demo mode.
 */
import { prisma } from "@zeta/db";

export async function resolveWorkspaceId(slug?: string | null): Promise<string> {
  if (slug) {
    const bySlug = await prisma.workspace.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (bySlug) return bySlug.id;
  }
  const first = await prisma.workspace.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (!first) throw new Error("No workspace found");
  return first.id;
}

/** Base URL for the agent-api service (KB ingest + LLM generation live there). */
export function agentApiUrl(): string {
  return (
    process.env.AGENT_API_URL ??
    process.env.NEXT_PUBLIC_AGENT_API_URL ??
    "http://localhost:3002"
  );
}
