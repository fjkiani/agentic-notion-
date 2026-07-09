import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@zeta/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const pipeline = await prisma.grantPipeline.findMany({
      include: {
        org: {
          include: {
            contacts: { where: { isPrimary: true }, take: 1 },
            openGrants: { where: { status: "OPEN" }, take: 3 },
            _count: { select: { dossiers: true } },
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    });
    return NextResponse.json({ entries: pipeline, pipeline });
  } catch (err) {
    console.error("[/api/caid/pipeline GET] Error:", err);
    return NextResponse.json({ error: "Failed to fetch pipeline" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { orgId, status, notes, nextAction, nextActionAt, priority, tags } = body;

    if (!orgId) {
      return NextResponse.json({ error: "orgId required" }, { status: 400 });
    }

    const entry = await prisma.grantPipeline.upsert({
      where: { orgId },
      create: {
        orgId,
        status: status ?? "IDENTIFIED",
        notes,
        nextAction,
        nextActionAt: nextActionAt ? new Date(nextActionAt) : undefined,
        priority,
        tags: tags ?? [],
      },
      update: {
        status: status ?? "IDENTIFIED",
        notes,
        nextAction,
        nextActionAt: nextActionAt ? new Date(nextActionAt) : undefined,
        priority,
        tags: tags ?? [],
      },
      include: { org: true },
    });

    return NextResponse.json(entry);
  } catch (err) {
    console.error("[/api/caid/pipeline POST] Error:", err);
    return NextResponse.json({ error: "Failed to create pipeline entry" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { orgId, ...updates } = body;

    if (!orgId) {
      return NextResponse.json({ error: "orgId required" }, { status: 400 });
    }

    const entry = await prisma.grantPipeline.update({
      where: { orgId },
      data: {
        ...updates,
        nextActionAt: updates.nextActionAt ? new Date(updates.nextActionAt) : undefined,
      },
      include: { org: true },
    });

    return NextResponse.json(entry);
  } catch (err) {
    console.error("[/api/caid/pipeline PATCH] Error:", err);
    return NextResponse.json({ error: "Failed to update pipeline entry" }, { status: 500 });
  }
}
