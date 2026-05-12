import { z } from "zod";
import { prisma } from "@zeta/db";
import type { MCPToolDefinition } from "../registry.js";

export const searchTools: MCPToolDefinition[] = [
  {
    name: "search",
    description: "Full-text search across all CAID entities — orgs, campaigns, initiatives, tasks, evidence, trials, biomarkers, patient stories",
    inputSchema: z.object({
      workspaceId: z.string(),
      query: z.string().min(1).max(500),
      types: z.array(z.enum(["org", "campaign", "initiative", "task", "evidence", "trial", "biomarker", "story"])).optional(),
      limit: z.number().int().min(1).max(50).default(10).optional(),
    }),
    handler: async (input) => {
      const { workspaceId, query, types, limit = 10 } = input as {
        workspaceId: string; query: string; types?: string[]; limit?: number;
      };
      const q = query.toLowerCase();
      const results: Array<{ id: string; type: string; title: string; description?: string; url: string }> = [];

      const searchAll = !types || types.length === 0;

      if (searchAll || types?.includes("org")) {
        const orgs = await prisma.advocacyOrg.findMany({
          where: {
            workspaceId,
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { description: { contains: q, mode: "insensitive" } },
              { mission: { contains: q, mode: "insensitive" } },
            ],
          },
          take: limit,
          select: { id: true, name: true, description: true, slug: true, workspaceId: true },
        });
        results.push(...orgs.map((o) => ({
          id: o.id, type: "org", title: o.name,
          description: o.description ?? undefined,
          url: `/${o.workspaceId}/orgs/${o.slug}`,
        })));
      }

      if (searchAll || types?.includes("campaign")) {
        const campaigns = await prisma.campaign.findMany({
          where: {
            org: { workspaceId },
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { description: { contains: q, mode: "insensitive" } },
              { objective: { contains: q, mode: "insensitive" } },
            ],
          },
          take: limit,
          select: { id: true, name: true, description: true, slug: true, orgId: true },
        });
        results.push(...campaigns.map((c) => ({
          id: c.id, type: "campaign", title: c.name,
          description: c.description ?? undefined,
          url: `/campaigns/${c.slug}`,
        })));
      }

      if (searchAll || types?.includes("task")) {
        const tasks = await prisma.task.findMany({
          where: {
            initiative: { campaign: { org: { workspaceId } } },
            OR: [
              { title: { contains: q, mode: "insensitive" } },
              { description: { contains: q, mode: "insensitive" } },
            ],
          },
          take: limit,
          select: { id: true, title: true, description: true, slug: true, status: true },
        });
        results.push(...tasks.map((t) => ({
          id: t.id, type: "task", title: t.title,
          description: t.description ?? undefined,
          url: `/tasks/${t.id}`,
        })));
      }

      if (searchAll || types?.includes("evidence")) {
        const evidence = await prisma.evidence.findMany({
          where: {
            OR: [
              { title: { contains: q, mode: "insensitive" } },
              { summary: { contains: q, mode: "insensitive" } },
              { aiSummary: { contains: q, mode: "insensitive" } },
            ],
          },
          take: limit,
          select: { id: true, title: true, summary: true, evidenceType: true },
        });
        results.push(...evidence.map((e) => ({
          id: e.id, type: "evidence", title: e.title,
          description: e.summary ?? undefined,
          url: `/evidence/${e.id}`,
        })));
      }

      if (searchAll || types?.includes("biomarker")) {
        const biomarkers = await prisma.biomarker.findMany({
          where: {
            OR: [
              { symbol: { contains: q, mode: "insensitive" } },
              { name: { contains: q, mode: "insensitive" } },
              { clinicalSignificance: { contains: q, mode: "insensitive" } },
            ],
          },
          take: limit,
          select: { id: true, symbol: true, name: true, clinicalSignificance: true },
        });
        results.push(...biomarkers.map((b) => ({
          id: b.id, type: "biomarker", title: `${b.symbol} — ${b.name}`,
          description: b.clinicalSignificance ?? undefined,
          url: `/biomarkers/${b.symbol}`,
        })));
      }

      if (searchAll || types?.includes("story")) {
        const stories = await prisma.patientStory.findMany({
          where: {
            org: { workspaceId },
            OR: [
              { title: { contains: q, mode: "insensitive" } },
              { summary: { contains: q, mode: "insensitive" } },
              { cancerType: { contains: q, mode: "insensitive" } },
            ],
          },
          take: limit,
          select: { id: true, title: true, summary: true, cancerType: true, slug: true },
        });
        results.push(...stories.map((s) => ({
          id: s.id, type: "story", title: s.title,
          description: s.summary ?? undefined,
          url: `/stories/${s.slug}`,
        })));
      }

      return { results: results.slice(0, limit), total: results.length };
    },
  },
];
