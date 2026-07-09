import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@zeta/db";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const body = await request.json();
    const {
      status, submittedAt, decisionAt, awardedAmount, askAmount,
      notes, nextStep, internalScore, funderScore, dossierId, title,
    } = body;

    const validStatuses = ["DRAFTING", "INTERNAL_REVIEW", "SUBMITTED", "UNDER_REVIEW", "AWARDED", "REJECTED", "WITHDRAWN"];
    if (status && !validStatuses.includes(status)) {
      return NextResponse.json({ error: `Invalid status: ${status}` }, { status: 400 });
    }

    const application = await prisma.grantApplication.update({
      where: { id },
      data: {
        ...(status ? { status } : {}),
        ...(title !== undefined ? { title } : {}),
        ...(submittedAt ? { submittedAt: new Date(submittedAt) } : {}),
        ...(decisionAt ? { decisionAt: new Date(decisionAt) } : {}),
        ...(awardedAmount !== undefined ? { awardedAmount: parseFloat(awardedAmount) } : {}),
        ...(askAmount !== undefined ? { askAmount: parseFloat(askAmount) } : {}),
        ...(notes !== undefined ? { notes } : {}),
        ...(nextStep !== undefined ? { nextStep } : {}),
        ...(internalScore !== undefined ? { internalScore: parseInt(internalScore) } : {}),
        ...(funderScore !== undefined ? { funderScore: parseInt(funderScore) } : {}),
        ...(dossierId ? { dossierId } : {}),
      },
      include: {
        org: { select: { id: true, name: true } },
        grant: { select: { id: true, title: true } },
        dossier: { select: { id: true, title: true } },
      },
    });

    return NextResponse.json({ application });
  } catch (err) {
    console.error("[/api/caid/applications/[id] PATCH] Error:", err);
    return NextResponse.json({ error: "Failed to update application" }, { status: 500 });
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const application = await prisma.grantApplication.findUnique({
      where: { id: params.id },
      include: {
        org: { select: { id: true, name: true, slug: true, country: true } },
        grant: { select: { id: true, title: true, fundingAmountMax: true, currency: true, deadline: true, contactName: true, contactEmail: true, applicationUrl: true } },
        dossier: { select: { id: true, title: true, type: true, content: true, createdAt: true } },
      },
    });

    if (!application) {
      return NextResponse.json({ error: "Application not found" }, { status: 404 });
    }

    return NextResponse.json({ application });
  } catch (err) {
    return NextResponse.json({ error: "Failed to fetch application" }, { status: 500 });
  }
}
