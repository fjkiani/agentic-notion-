import { NextResponse } from "next/server";
import { prisma } from "@zeta/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [
      totalOrgs,
      openGrantsCount,
      pipelineStats,
      topFundersBySpend,
      gbmOrgs,
      countryBreakdown,
      cancerTypeBreakdown,
      recentDossiers,
    ] = await Promise.all([
      prisma.advocacyOrg.count(),
      prisma.openGrant.count({ where: { status: "OPEN" } }),
      prisma.grantPipeline.groupBy({
        by: ["status"],
        _count: { status: true },
      }),
      prisma.advocacyOrg.findMany({
        where: { researchSpend: { gt: 0 } },
        orderBy: { researchSpend: "desc" },
        take: 10,
        select: {
          id: true,
          name: true,
          shortName: true,
          country: true,
          researchSpend: true,
          annualBudget: true,
          cancerTypes: true,
          externalId: true,
          pipeline: { select: { status: true } },
          _count: { select: { openGrants: true } },
        },
      }),
      prisma.advocacyOrg.findMany({
        where: {
          OR: [
            { cancerTypes: { has: "GBM" } },
            { cancerTypes: { has: "Brain cancer" } },
            { cancerTypes: { has: "Brain tumors" } },
            { cancerTypes: { has: "Brain tumors (all types, GBM focus)" } },
            { cancerTypes: { has: "GBM/brain cancer" } },
          ],
        },
        orderBy: { researchSpend: "desc" },
        select: {
          id: true,
          name: true,
          country: true,
          researchSpend: true,
          cancerTypes: true,
          externalId: true,
          pipeline: { select: { status: true } },
          openGrants: { where: { status: "OPEN" }, select: { id: true, fundingAmountMax: true } },
        },
      }),
      prisma.advocacyOrg.groupBy({
        by: ["country"],
        _count: { country: true },
        orderBy: { _count: { country: "desc" } },
        take: 15,
      }),
      // Cancer type breakdown — raw from metadata
      prisma.advocacyOrg.findMany({
        select: { cancerTypes: true },
      }),
      prisma.dossier.findMany({
        orderBy: { createdAt: "desc" },
        take: 5,
        include: { org: { select: { name: true, id: true } } },
      }),
    ]);

    // Aggregate cancer types
    const cancerTypeCounts: Record<string, number> = {};
    for (const org of cancerTypeBreakdown) {
      for (const ct of org.cancerTypes) {
        cancerTypeCounts[ct] = (cancerTypeCounts[ct] ?? 0) + 1;
      }
    }
    const topCancerTypes = Object.entries(cancerTypeCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([type, count]) => ({ type, count }));

    // Pipeline status map
    const pipelineMap: Record<string, number> = {};
    for (const row of pipelineStats) {
      pipelineMap[row.status] = row._count.status;
    }

    // Total research spend
    const totalSpendResult = await prisma.advocacyOrg.aggregate({
      _sum: { researchSpend: true },
    });

    return NextResponse.json({
      totalOrgs,
      openGrantsCount,
      totalResearchSpend: totalSpendResult._sum.researchSpend ?? 0,
      pipelineByStatus: pipelineMap,
      topFundersBySpend,
      gbmOrgs,
      countryBreakdown,
      topCancerTypes,
      recentDossiers,
    });
  } catch (err) {
    console.error("[/api/caid/insights] Error:", err);
    return NextResponse.json({ error: "Failed to fetch insights" }, { status: 500 });
  }
}
