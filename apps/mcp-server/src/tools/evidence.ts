import { z } from "zod";
import { prisma } from "@zeta/db";
import type { MCPToolDefinition } from "../registry.js";

export const evidenceTools: MCPToolDefinition[] = [
  {
    name: "evidence_list",
    description: "List evidence items for an initiative or task, optionally filtered by type, strength, or cancer type",
    inputSchema: z.object({
      initiativeId: z.string().optional(),
      taskId: z.string().optional(),
      evidenceType: z.string().optional(),
      strength: z.string().optional(),
      cancerType: z.string().optional(),
      biomarker: z.string().optional(),
      limit: z.number().int().min(1).max(100).default(20).optional(),
      offset: z.number().int().min(0).default(0).optional(),
    }),
    handler: async (input) => {
      const { initiativeId, taskId, evidenceType, strength, cancerType, biomarker, limit = 20, offset = 0 } = input as {
        initiativeId?: string; taskId?: string; evidenceType?: string; strength?: string;
        cancerType?: string; biomarker?: string; limit?: number; offset?: number;
      };
      const where: Record<string, unknown> = {};
      if (initiativeId) where["initiativeId"] = initiativeId;
      if (taskId) where["taskId"] = taskId;
      if (evidenceType) where["evidenceType"] = evidenceType;
      if (strength) where["strength"] = strength;
      if (cancerType) where["cancerTypes"] = { has: cancerType };
      if (biomarker) where["biomarkers"] = { has: biomarker };

      const [evidence, total] = await Promise.all([
        prisma.evidence.findMany({
          where,
          take: limit,
          skip: offset,
          orderBy: [{ relevanceScore: "desc" }, { publishedAt: "desc" }],
        }),
        prisma.evidence.count({ where }),
      ]);
      return { evidence, total, hasMore: offset + limit < total };
    },
  },
  {
    name: "evidence_create",
    description: "Add a new evidence item (publication, trial, FDA guidance, etc.) to an initiative or task",
    inputSchema: z.object({
      initiativeId: z.string().optional(),
      taskId: z.string().optional(),
      title: z.string().min(2).max(500),
      summary: z.string().optional(),
      content: z.string().optional(),
      evidenceType: z.enum(["PUBLICATION", "CLINICAL_TRIAL", "FDA_GUIDANCE", "CONGRESSIONAL_RECORD", "PRESS_RELEASE", "PATIENT_TESTIMONY", "EXPERT_OPINION", "SYSTEMATIC_REVIEW", "META_ANALYSIS", "REAL_WORLD_DATA", "BIOMARKER_DATA", "POLICY_BRIEF"]).default("PUBLICATION"),
      source: z.string().optional(),
      sourceUrl: z.string().optional(),
      doi: z.string().optional(),
      pmid: z.string().optional(),
      publishedAt: z.string().optional(),
      authors: z.array(z.string()).default([]),
      cancerTypes: z.array(z.string()).default([]),
      biomarkers: z.array(z.string()).default([]),
      strength: z.enum(["STRONG", "MODERATE", "WEAK", "ANECDOTAL"]).default("MODERATE"),
      relevanceScore: z.number().min(0).max(1).optional(),
      aiSummary: z.string().optional(),
      tags: z.array(z.string()).default([]),
    }),
    handler: async (input) => {
      const { publishedAt, ...rest } = input as { publishedAt?: string; [key: string]: unknown };
      const evidence = await prisma.evidence.create({
        data: {
          ...rest,
          publishedAt: publishedAt ? new Date(publishedAt) : undefined,
        } as Parameters<typeof prisma.evidence.create>[0]["data"],
      });
      return evidence;
    },
  },
  {
    name: "evidence_search_pubmed",
    description: "Search PubMed for cancer advocacy evidence and return structured results ready to save",
    inputSchema: z.object({
      query: z.string().min(2),
      cancerType: z.string().optional(),
      biomarker: z.string().optional(),
      maxResults: z.number().int().min(1).max(20).default(10).optional(),
    }),
    handler: async (input) => {
      const { query, cancerType, biomarker, maxResults = 10 } = input as {
        query: string; cancerType?: string; biomarker?: string; maxResults?: number;
      };
      const searchTerms = [query, cancerType, biomarker].filter(Boolean).join(" AND ");
      const encodedQuery = encodeURIComponent(searchTerms);
      const url = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodedQuery}&retmax=${maxResults}&retmode=json`;

      const searchRes = await fetch(url);
      const searchData = await searchRes.json() as { esearchresult: { idlist: string[] } };
      const ids = searchData.esearchresult?.idlist ?? [];

      if (ids.length === 0) return { results: [], total: 0 };

      const summaryUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${ids.join(",")}&retmode=json`;
      const summaryRes = await fetch(summaryUrl);
      const summaryData = await summaryRes.json() as { result: Record<string, { uid: string; title: string; source: string; pubdate: string; authors: Array<{ name: string }>; doi?: string }> };

      const results = ids.map((id) => {
        const item = summaryData.result[id];
        if (!item) return null;
        return {
          pmid: id,
          title: item.title,
          source: item.source,
          publishedAt: item.pubdate,
          authors: item.authors?.map((a) => a.name) ?? [],
          doi: item.doi,
          evidenceType: "PUBLICATION",
          cancerTypes: cancerType ? [cancerType] : [],
          biomarkers: biomarker ? [biomarker] : [],
          strength: "MODERATE",
        };
      }).filter(Boolean);

      return { results, total: results.length };
    },
  },
  {
    name: "evidence_bulk_create",
    description: "Create multiple evidence items at once — used by Research Intelligence agent",
    inputSchema: z.object({
      initiativeId: z.string().optional(),
      items: z.array(z.object({
        title: z.string(),
        summary: z.string().optional(),
        evidenceType: z.string().default("PUBLICATION"),
        source: z.string().optional(),
        sourceUrl: z.string().optional(),
        doi: z.string().optional(),
        pmid: z.string().optional(),
        publishedAt: z.string().optional(),
        authors: z.array(z.string()).default([]),
        cancerTypes: z.array(z.string()).default([]),
        biomarkers: z.array(z.string()).default([]),
        strength: z.string().default("MODERATE"),
        relevanceScore: z.number().optional(),
        aiSummary: z.string().optional(),
      })),
    }),
    handler: async (input) => {
      const { initiativeId, items } = input as {
        initiativeId?: string; items: Array<Record<string, unknown>>;
      };
      const created = await prisma.$transaction(
        items.map((item) =>
          prisma.evidence.create({
            data: {
              initiativeId,
              title: item.title as string,
              summary: item.summary as string | undefined,
              evidenceType: (item.evidenceType as import("@zeta/db").EvidenceType) ?? "PUBLICATION",
              source: item.source as string | undefined,
              sourceUrl: item.sourceUrl as string | undefined,
              doi: item.doi as string | undefined,
              pmid: item.pmid as string | undefined,
              publishedAt: (item.publishedAt as string) ? new Date(item.publishedAt as string) : undefined,
              authors: (item.authors as string[]) ?? [],
              cancerTypes: (item.cancerTypes as string[]) ?? [],
              biomarkers: (item.biomarkers as string[]) ?? [],
              strength: (item.strength as import("@zeta/db").EvidenceStrength) ?? "MODERATE",
              relevanceScore: item.relevanceScore as number | undefined,
              aiSummary: item.aiSummary as string | undefined,
            },
          })
        )
      );
      return { created: created.length, evidence: created };
    },
  },
];
