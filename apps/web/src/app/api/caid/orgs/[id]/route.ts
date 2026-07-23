import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@zeta/db";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const org = await prisma.advocacyOrg.findFirst({
      where: { OR: [{ id }, { externalId: id }, { slug: id }] },
      include: {
        contacts: { orderBy: [{ isPrimary: "desc" }, { role: "asc" }] },
        openGrants: { orderBy: { createdAt: "desc" } },
        pipeline: true,
        dossiers: { orderBy: { createdAt: "desc" }, take: 20 },
        campaigns: {
          take: 5,
          orderBy: { createdAt: "desc" },
          include: { _count: { select: { initiatives: true } } },
        },
        _count: { select: { dossiers: true, openGrants: true, contacts: true } },
      },
    });

    if (!org) {
      return NextResponse.json({ error: "Org not found" }, { status: 404 });
    }

    return NextResponse.json(org);
  } catch (err) {
    console.error("[/api/caid/orgs/[id]] Error:", err);
    return NextResponse.json({ error: "Failed to fetch org" }, { status: 500 });
  }
}
