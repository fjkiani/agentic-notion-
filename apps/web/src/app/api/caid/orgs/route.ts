import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@zeta/db";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const cancerType = searchParams.get("cancerType");
  const country = searchParams.get("country");
  const orgType = searchParams.get("orgType");
  const pipelineStatus = searchParams.get("pipelineStatus");
  const search = searchParams.get("search");
  const sortBy = searchParams.get("sortBy") ?? "researchSpend";
  const sortDir = searchParams.get("sortDir") === "asc" ? "asc" : "desc";
  const page = parseInt(searchParams.get("page") ?? "1");
  const limit = parseInt(searchParams.get("limit") ?? "50");

  try {
    const where: Record<string, unknown> = {};

    if (cancerType) {
      where.cancerTypes = { has: cancerType };
    }
    if (country) {
      where.country = { contains: country, mode: "insensitive" };
    }
    if (orgType) {
      where.orgType = orgType;
    }
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
        { mission: { contains: search, mode: "insensitive" } },
      ];
    }
    if (pipelineStatus) {
      where.pipeline = { status: pipelineStatus };
    }

    const orderBy: Record<string, string> = {};
    if (sortBy === "researchSpend") orderBy.researchSpend = sortDir;
    else if (sortBy === "annualBudget") orderBy.annualBudget = sortDir;
    else if (sortBy === "name") orderBy.name = sortDir;
    else orderBy.researchSpend = "desc";

    const [orgs, total] = await Promise.all([
      prisma.advocacyOrg.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        include: {
          contacts: { where: { isPrimary: true }, take: 3 },
          openGrants: { where: { status: "OPEN" }, take: 5 },
          pipeline: true,
          _count: { select: { dossiers: true, openGrants: true } },
        },
      }),
      prisma.advocacyOrg.count({ where }),
    ]);

    return NextResponse.json({ orgs, total, page, limit });
  } catch (err) {
    console.error("[/api/caid/orgs] Error:", err);
    return NextResponse.json({ error: "Failed to fetch orgs" }, { status: 500 });
  }
}
