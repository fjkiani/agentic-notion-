import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@zeta/db";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const status = searchParams.get("status");
    const orgId = searchParams.get("orgId");

    const where: Record<string, unknown> = {};
    if (status) where["status"] = status;
    if (orgId) where["orgId"] = orgId;

    const applications = await prisma.grantApplication.findMany({
      where,
      include: {
        org: { select: { id: true, name: true, slug: true, country: true, externalId: true } },
        grant: { select: { id: true, title: true, fundingAmountMax: true, currency: true, deadline: true, contactName: true } },
        dossier: { select: { id: true, title: true, type: true, createdAt: true } },
      },
      orderBy: { updatedAt: "desc" },
    });

    // Compute stats
    const stats = {
      total: applications.length,
      drafting: applications.filter((a) => a.status === "DRAFTING").length,
      internalReview: applications.filter((a) => a.status === "INTERNAL_REVIEW").length,
      submitted: applications.filter((a) => a.status === "SUBMITTED").length,
      underReview: applications.filter((a) => a.status === "UNDER_REVIEW").length,
      awarded: applications.filter((a) => a.status === "AWARDED").length,
      rejected: applications.filter((a) => a.status === "REJECTED").length,
      totalAwarded: applications
        .filter((a) => a.status === "AWARDED" && a.awardedAmount)
        .reduce((sum, a) => sum + (a.awardedAmount ?? 0), 0),
      totalAsk: applications
        .filter((a) => a.askAmount)
        .reduce((sum, a) => sum + (a.askAmount ?? 0), 0),
    };

    return NextResponse.json({ applications, stats });
  } catch (err) {
    console.error("[/api/caid/applications GET] Error:", err);
    return NextResponse.json({ error: "Failed to fetch applications" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { orgId, grantId, dossierId, title, askAmount, notes, nextStep, internalScore, funderScore } = body;

    if (!orgId || !title) {
      return NextResponse.json({ error: "orgId and title required" }, { status: 400 });
    }

    const application = await prisma.grantApplication.create({
      data: {
        orgId,
        grantId: grantId ?? null,
        dossierId: dossierId ?? null,
        title,
        status: "DRAFTING",
        askAmount: askAmount ? parseFloat(askAmount) : null,
        notes: notes ?? null,
        nextStep: nextStep ?? null,
        internalScore: internalScore ? parseInt(internalScore) : null,
        funderScore: funderScore ? parseInt(funderScore) : null,
      },
      include: {
        org: { select: { id: true, name: true } },
        grant: { select: { id: true, title: true } },
      },
    });

    return NextResponse.json({ application }, { status: 201 });
  } catch (err) {
    console.error("[/api/caid/applications POST] Error:", err);
    return NextResponse.json({ error: "Failed to create application" }, { status: 500 });
  }
}
