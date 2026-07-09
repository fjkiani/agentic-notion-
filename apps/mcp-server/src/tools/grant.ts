import { z } from "zod";
import { prisma } from "@zeta/db";
import type { MCPToolDefinition } from "../registry.js";

const TAVILY_API_KEY = process.env.TAVILY_API_KEY ?? "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";

async function searchTavilyForGrants(query: string): Promise<Array<{ title: string; url: string; content: string; score: number }>> {
  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: TAVILY_API_KEY,
        query,
        search_depth: "advanced",
        max_results: 10,
        include_answer: false,
      }),
    });
    if (!res.ok) return [];
    const data = await res.json() as { results?: Array<{ title: string; url: string; content: string; score: number }> };
    return data.results ?? [];
  } catch {
    return [];
  }
}

function scoreGrant(grant: {
  fundingAmountMax?: number | null;
  deadline?: Date | null;
  cancerTypes?: string[];
  status?: string;
}, targetCancerTypes: string[]): { eligibility: number; funding: number; urgency: number; composite: number } {
  // Eligibility: cancer type overlap
  const grantTypes = (grant.cancerTypes ?? []).map((t) => t.toLowerCase());
  const targetTypes = targetCancerTypes.map((t) => t.toLowerCase());
  const overlap = targetTypes.filter((t) =>
    grantTypes.some((g) => g.includes(t) || t.includes(g) || g.includes("brain") || g.includes("gbm") || g.includes("cancer"))
  ).length;
  const eligibility = Math.min(10, overlap > 0 ? 6 + overlap * 2 : 3);

  // Funding size score
  const max = grant.fundingAmountMax ?? 0;
  const funding = max >= 1000000 ? 10 : max >= 500000 ? 9 : max >= 250000 ? 7 : max >= 100000 ? 5 : max > 0 ? 3 : 2;

  // Urgency: days until deadline
  let urgency = 5;
  if (grant.deadline) {
    const days = Math.floor((new Date(grant.deadline).getTime() - Date.now()) / 86400000);
    urgency = days < 0 ? 0 : days <= 14 ? 10 : days <= 30 ? 9 : days <= 60 ? 7 : days <= 90 ? 5 : days <= 180 ? 3 : 2;
  }

  const composite = Math.round((eligibility * 0.4 + funding * 0.35 + urgency * 0.25) * 10) / 10;
  return { eligibility, funding, urgency, composite };
}

export const grantTools: MCPToolDefinition[] = [
  {
    name: "grant_list",
    description: "List open funding grants for cancer advocacy organizations, with optional filters",
    inputSchema: z.object({
      workspaceId: z.string(),
      cancerType: z.string().optional(),
      status: z.enum(["OPEN", "CLOSED", "UPCOMING", "UNKNOWN"]).optional(),
      limit: z.number().int().min(1).max(100).default(20).optional(),
      offset: z.number().int().min(0).default(0).optional(),
    }),
    handler: async (input) => {
      const { workspaceId, cancerType, status, limit = 20, offset = 0 } = input as {
        workspaceId: string;
        cancerType?: string;
        status?: string;
        limit?: number;
        offset?: number;
      };

      const where: Record<string, unknown> = { workspaceId };
      if (cancerType) where["cancerTypes"] = { has: cancerType };
      if (status) where["status"] = status;

      const [grants, total] = await Promise.all([
        prisma.openGrant.findMany({
          where,
          take: limit,
          skip: offset,
          orderBy: [{ status: "asc" }, { deadline: "asc" }, { title: "asc" }],
          include: {
            org: { select: { id: true, name: true, slug: true } },
          },
        }),
        prisma.openGrant.count({ where }),
      ]);

      return {
        grants,
        total,
        page: Math.floor(offset / limit) + 1,
        hasMore: offset + limit < total,
      };
    },
  },

  {
    name: "grant_get",
    description: "Get a single grant by ID with organization details",
    inputSchema: z.object({
      id: z.string(),
      workspaceId: z.string().optional(),
    }),
    handler: async (input) => {
      const { id, workspaceId } = input as { id: string; workspaceId?: string };
      const grant = await prisma.openGrant.findFirst({
        where: { id, ...(workspaceId ? { workspaceId } : {}) },
        include: {
          org: { select: { id: true, name: true, slug: true, website: true } },
        },
      });
      if (!grant) return { found: false, id };
      return { found: true, grant };
    },
  },

  {
    name: "grant_create",
    description: "Create a new grant opportunity record in the database",
    inputSchema: z.object({
      workspaceId: z.string(),
      orgId: z.string(),
      title: z.string(),
      description: z.string().optional(),
      fundingAmountMin: z.number().optional(),
      fundingAmountMax: z.number().optional(),
      currency: z.string().default("USD").optional(),
      deadline: z.string().optional(),
      deadlineRaw: z.string().optional(),
      applicationUrl: z.string().optional(),
      status: z.enum(["OPEN", "CLOSED", "UPCOMING", "ROLLING", "UNKNOWN"]).default("OPEN").optional(),
      grantType: z.enum(["RESEARCH", "CLINICAL_TRIAL", "FELLOWSHIP", "SEED", "INNOVATION", "PATIENT_SUPPORT", "GENERAL"]).default("RESEARCH").optional(),
      cancerTypes: z.array(z.string()).default([]).optional(),
      geographicScope: z.array(z.string()).default([]).optional(),
      eligibilityCriteria: z.string().optional(),
      requiresLOI: z.boolean().default(false).optional(),
      loiDeadlineRaw: z.string().optional(),
      awardDuration: z.string().optional(),
      numberOfAwards: z.number().int().optional(),
      contactName: z.string().optional(),
      contactEmail: z.string().optional(),
      notes: z.string().optional(),
      sourceNotes: z.string().optional(),
    }),
    handler: async (input) => {
      const data = input as {
        workspaceId: string; orgId: string; title: string; description?: string;
        fundingAmountMin?: number; fundingAmountMax?: number; currency?: string;
        deadline?: string; deadlineRaw?: string; applicationUrl?: string;
        status?: "OPEN" | "CLOSED" | "UPCOMING" | "ROLLING" | "UNKNOWN";
        grantType?: "RESEARCH" | "CLINICAL_TRIAL" | "FELLOWSHIP" | "SEED" | "INNOVATION" | "PATIENT_SUPPORT" | "GENERAL";
        cancerTypes?: string[]; geographicScope?: string[]; eligibilityCriteria?: string;
        requiresLOI?: boolean; loiDeadlineRaw?: string; awardDuration?: string;
        numberOfAwards?: number; contactName?: string; contactEmail?: string;
        notes?: string; sourceNotes?: string;
      };

      const grant = await prisma.openGrant.create({
        data: {
          workspaceId: data.workspaceId,
          orgId: data.orgId,
          title: data.title,
          description: data.description,
          fundingAmountMin: data.fundingAmountMin,
          fundingAmountMax: data.fundingAmountMax,
          currency: data.currency ?? "USD",
          deadline: data.deadline ? new Date(data.deadline) : undefined,
          deadlineRaw: data.deadlineRaw,
          applicationUrl: data.applicationUrl,
          status: data.status ?? "OPEN",
          grantType: data.grantType ?? "RESEARCH",
          cancerTypes: data.cancerTypes ?? [],
          geographicScope: data.geographicScope ?? [],
          eligibilityCriteria: data.eligibilityCriteria,
          requiresLOI: data.requiresLOI ?? false,
          loiDeadlineRaw: data.loiDeadlineRaw,
          awardDuration: data.awardDuration,
          numberOfAwards: data.numberOfAwards,
          contactName: data.contactName,
          contactEmail: data.contactEmail,
          notes: data.notes,
          sourceNotes: data.sourceNotes,
        },
        include: { org: { select: { id: true, name: true } } },
      });

      return { created: true, grant };
    },
  },

  {
    name: "grant_find_opportunities",
    description: "Find and score open grant opportunities by cancer type. Queries the database AND searches the web via Tavily for new opportunities not yet in the database. Returns a ranked list with eligibility, funding size, and urgency scores.",
    inputSchema: z.object({
      workspaceId: z.string(),
      cancerTypes: z.array(z.string()).describe("Cancer types to match, e.g. ['GBM', 'brain cancer', 'glioblastoma']"),
      country: z.string().optional().describe("Filter by country, e.g. 'UK', 'USA'"),
      keywords: z.array(z.string()).optional().describe("Additional keywords to search for"),
      includeWebSearch: z.boolean().default(true).optional().describe("Whether to search the web for new opportunities"),
      minFundingAmount: z.number().optional().describe("Minimum funding amount in USD"),
    }),
    handler: async (input) => {
      const { workspaceId, cancerTypes, country, keywords, includeWebSearch = true, minFundingAmount } = input as {
        workspaceId: string;
        cancerTypes: string[];
        country?: string;
        keywords?: string[];
        includeWebSearch?: boolean;
        minFundingAmount?: number;
      };

      // 1. Query DB for open grants
      const dbGrants = await prisma.openGrant.findMany({
        where: {
          workspaceId,
          status: { in: ["OPEN", "ROLLING", "UPCOMING"] },
          ...(country ? { geographicScope: { has: country } } : {}),
          ...(minFundingAmount ? { fundingAmountMax: { gte: minFundingAmount } } : {}),
        },
        include: {
          org: { select: { id: true, name: true, slug: true, country: true } },
          applications: { select: { id: true, status: true } },
        },
        orderBy: { deadline: "asc" },
      });

      // 2. Score each DB grant
      const scoredDbGrants = dbGrants.map((g) => {
        const scores = scoreGrant(g, cancerTypes);
        const daysUntilDeadline = g.deadline
          ? Math.floor((new Date(g.deadline).getTime() - Date.now()) / 86400000)
          : null;
        return {
          source: "database" as const,
          id: g.id,
          title: g.title,
          orgName: g.org.name,
          orgId: g.org.id,
          country: g.org.country,
          fundingAmountMin: g.fundingAmountMin,
          fundingAmountMax: g.fundingAmountMax,
          currency: g.currency,
          deadline: g.deadline,
          daysUntilDeadline,
          status: g.status,
          cancerTypes: g.cancerTypes,
          applicationUrl: g.applicationUrl,
          requiresLOI: g.requiresLOI,
          loiDeadlineRaw: g.loiDeadlineRaw,
          contactName: g.contactName,
          existingApplications: g.applications.length,
          scores,
        };
      });

      // 3. Web search for new opportunities
      let webResults: Array<{ title: string; url: string; snippet: string; isNew: boolean }> = [];
      if (includeWebSearch) {
        const searchQuery = [
          ...cancerTypes.map((t) => `"${t}"`).join(" OR "),
          "grant funding 2026 open applications",
          ...(country ? [`site:${country === "UK" ? ".org.uk OR .ac.uk" : ".org OR .gov"}`] : []),
          ...(keywords ?? []),
        ].join(" ");

        const tavilyResults = await searchTavilyForGrants(searchQuery);
        webResults = tavilyResults.map((r) => ({
          title: r.title,
          url: r.url,
          snippet: r.content.substring(0, 300),
          isNew: !dbGrants.some((g) => g.applicationUrl === r.url || g.title.toLowerCase().includes(r.title.toLowerCase().substring(0, 20))),
        })).filter((r) => r.isNew);
      }

      // 4. Sort by composite score
      scoredDbGrants.sort((a, b) => b.scores.composite - a.scores.composite);

      // 5. Build recommendations
      const topOpportunities = scoredDbGrants.slice(0, 5);
      const recommendations = topOpportunities.map((g, i) => ({
        rank: i + 1,
        action: g.daysUntilDeadline !== null && g.daysUntilDeadline <= 30
          ? "URGENT: Draft application immediately"
          : g.daysUntilDeadline !== null && g.daysUntilDeadline <= 90
          ? "Draft application within 2 weeks"
          : "Research and prepare LOI",
        grant: g.title,
        org: g.orgName,
        score: g.scores.composite,
        deadline: g.deadline,
      }));

      return {
        totalFound: scoredDbGrants.length,
        rankedOpportunities: scoredDbGrants,
        newWebOpportunities: webResults,
        topRecommendations: recommendations,
        searchedCancerTypes: cancerTypes,
        generatedAt: new Date().toISOString(),
      };
    },
  },

  {
    name: "application_create",
    description: "Create a new grant application tracking record",
    inputSchema: z.object({
      orgId: z.string(),
      grantId: z.string().optional(),
      dossierId: z.string().optional(),
      title: z.string(),
      askAmount: z.number().optional(),
      notes: z.string().optional(),
      nextStep: z.string().optional(),
      internalScore: z.number().int().min(1).max(10).optional(),
      funderScore: z.number().int().min(1).max(10).optional(),
    }),
    handler: async (input) => {
      const data = input as {
        orgId: string; grantId?: string; dossierId?: string; title: string;
        askAmount?: number; notes?: string; nextStep?: string;
        internalScore?: number; funderScore?: number;
      };

      const application = await prisma.grantApplication.create({
        data: {
          orgId: data.orgId,
          grantId: data.grantId,
          dossierId: data.dossierId,
          title: data.title,
          status: "DRAFTING",
          askAmount: data.askAmount,
          notes: data.notes,
          nextStep: data.nextStep,
          internalScore: data.internalScore,
          funderScore: data.funderScore,
        },
        include: {
          org: { select: { id: true, name: true } },
          grant: { select: { id: true, title: true } },
        },
      });

      return { created: true, application };
    },
  },

  {
    name: "application_update",
    description: "Update a grant application's status, scores, amounts, or notes",
    inputSchema: z.object({
      id: z.string(),
      status: z.enum(["DRAFTING", "INTERNAL_REVIEW", "SUBMITTED", "UNDER_REVIEW", "AWARDED", "REJECTED", "WITHDRAWN"]).optional(),
      submittedAt: z.string().optional(),
      decisionAt: z.string().optional(),
      awardedAmount: z.number().optional(),
      askAmount: z.number().optional(),
      notes: z.string().optional(),
      nextStep: z.string().optional(),
      internalScore: z.number().int().min(1).max(10).optional(),
      funderScore: z.number().int().min(1).max(10).optional(),
      dossierId: z.string().optional(),
    }),
    handler: async (input) => {
      const data = input as {
        id: string;
        status?: "DRAFTING" | "INTERNAL_REVIEW" | "SUBMITTED" | "UNDER_REVIEW" | "AWARDED" | "REJECTED" | "WITHDRAWN";
        submittedAt?: string; decisionAt?: string; awardedAmount?: number; askAmount?: number;
        notes?: string; nextStep?: string; internalScore?: number; funderScore?: number; dossierId?: string;
      };

      const application = await prisma.grantApplication.update({
        where: { id: data.id },
        data: {
          ...(data.status ? { status: data.status } : {}),
          ...(data.submittedAt ? { submittedAt: new Date(data.submittedAt) } : {}),
          ...(data.decisionAt ? { decisionAt: new Date(data.decisionAt) } : {}),
          ...(data.awardedAmount !== undefined ? { awardedAmount: data.awardedAmount } : {}),
          ...(data.askAmount !== undefined ? { askAmount: data.askAmount } : {}),
          ...(data.notes !== undefined ? { notes: data.notes } : {}),
          ...(data.nextStep !== undefined ? { nextStep: data.nextStep } : {}),
          ...(data.internalScore !== undefined ? { internalScore: data.internalScore } : {}),
          ...(data.funderScore !== undefined ? { funderScore: data.funderScore } : {}),
          ...(data.dossierId ? { dossierId: data.dossierId } : {}),
        },
        include: {
          org: { select: { id: true, name: true } },
          grant: { select: { id: true, title: true } },
        },
      });

      return { updated: true, application };
    },
  },
];
