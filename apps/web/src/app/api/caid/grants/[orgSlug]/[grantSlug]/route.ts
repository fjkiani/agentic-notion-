import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@zeta/db";

export const dynamic = "force-dynamic";

// GET /api/caid/grants/[orgSlug]/[grantSlug]
// Resolves a grant by its org slug + grant slug (human-readable deep link).
// orgSlug also accepts the org's externalId (e.g. "UK013") for backward compatibility.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ orgSlug: string; grantSlug: string }> }
) {
  const { orgSlug, grantSlug } = await params;

  try {
    const grant = await prisma.openGrant.findFirst({
      where: {
        slug: grantSlug,
        org: { OR: [{ slug: orgSlug }, { externalId: orgSlug }] },
      },
      include: {
        org: {
          select: {
            id: true,
            name: true,
            shortName: true,
            slug: true,
            externalId: true,
            website: true,
            country: true,
            cancerTypes: true,
          },
        },
        applications: {
          orderBy: { createdAt: "desc" },
          take: 10,
          select: { id: true, title: true, status: true, createdAt: true },
        },
      },
    });

    if (!grant) {
      return NextResponse.json({ error: "Grant not found" }, { status: 404 });
    }

    return NextResponse.json(grant);
  } catch (err) {
    console.error("[/api/caid/grants/[orgSlug]/[grantSlug]] Error:", err);
    return NextResponse.json({ error: "Failed to fetch grant" }, { status: 500 });
  }
}
