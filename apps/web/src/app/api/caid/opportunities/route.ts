import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@zeta/db";

export const dynamic = "force-dynamic";

function scoreGrant(grant: {
  fundingAmountMax?: number | null;
  deadline?: Date | null;
  cancerTypes?: string[];
}): { eligibility: number; funding: number; urgency: number; composite: number } {
  const gbmTypes = ["gbm", "brain", "glioblastoma", "glioma", "brain tumour", "brain tumor", "brain cancer"];
  const grantTypes = (grant.cancerTypes ?? []).map((t) => t.toLowerCase());
  const isGBMFocused = grantTypes.some((t) => gbmTypes.some((g) => t.includes(g)));
  const eligibility = isGBMFocused ? 9 : grantTypes.includes("pan-cancer") || grantTypes.includes("all cancers") ? 6 : 4;

  const max = grant.fundingAmountMax ?? 0;
  const funding = max >= 1000000 ? 10 : max >= 500000 ? 9 : max >= 250000 ? 7 : max >= 100000 ? 5 : max > 0 ? 3 : 2;

  let urgency = 5;
  if (grant.deadline) {
    const days = Math.floor((new Date(grant.deadline).getTime() - Date.now()) / 86400000);
    urgency = days < 0 ? 0 : days <= 14 ? 10 : days <= 30 ? 9 : days <= 60 ? 7 : days <= 90 ? 5 : days <= 180 ? 3 : 2;
  }

  const composite = Math.round((eligibility * 0.4 + funding * 0.35 + urgency * 0.25) * 10) / 10;
  return { eligibility, funding, urgency, composite };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const cancerType = searchParams.get("cancerType");
    const country = searchParams.get("country");
    const minFunding = searchParams.get("minFunding");
    const maxDays = searchParams.get("maxDays");

    const where: Record<string, unknown> = {
      status: { in: ["OPEN", "ROLLING", "UPCOMING"] },
    };
    if (cancerType) where["cancerTypes"] = { has: cancerType };
    if (country) where["geographicScope"] = { has: country };
    if (minFunding) where["fundingAmountMax"] = { gte: parseFloat(minFunding) };
    if (maxDays) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() + parseInt(maxDays));
      where["deadline"] = { lte: cutoff };
    }

    const grants = await prisma.openGrant.findMany({
      where,
      include: {
        org: {
          select: {
            id: true,
            name: true,
            slug: true,
            country: true,
            cancerTypes: true,
            pipeline: { select: { status: true } },
          },
        },
        applications: {
          select: { id: true, status: true, title: true },
        },
      },
      orderBy: { deadline: "asc" },
    });

    const scored = grants.map((g) => {
      const scores = scoreGrant(g);
      const daysUntilDeadline = g.deadline
        ? Math.floor((new Date(g.deadline).getTime() - Date.now()) / 86400000)
        : null;
      return {
        ...g,
        daysUntilDeadline,
        scores,
        urgencyLabel:
          daysUntilDeadline === null ? "No deadline"
          : daysUntilDeadline < 0 ? "Closed"
          : daysUntilDeadline <= 14 ? "URGENT"
          : daysUntilDeadline <= 30 ? "Soon"
          : daysUntilDeadline <= 90 ? "Upcoming"
          : "Open",
      };
    });

    // Sort by composite score DESC
    scored.sort((a, b) => b.scores.composite - a.scores.composite);

    return NextResponse.json({
      opportunities: scored,
      total: scored.length,
      urgent: scored.filter((g) => g.daysUntilDeadline !== null && g.daysUntilDeadline >= 0 && g.daysUntilDeadline <= 30).length,
    });
  } catch (err) {
    console.error("[/api/caid/opportunities] Error:", err);
    return NextResponse.json({ error: "Failed to fetch opportunities" }, { status: 500 });
  }
}
