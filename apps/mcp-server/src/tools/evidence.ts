import { z } from "zod";
import { prisma } from "@zeta/db";
import type { MCPToolDefinition } from "../registry.js";

// Schema-aligned enums (see prisma schema: EvidenceSource, EvidenceStrength).
const SOURCE_TYPES = [
  "PUBMED",
  "CLINICALTRIALS_GOV",
  "FDA",
  "CONGRESS",
  "NEWS",
  "GREY_LITERATURE",
  "PATIENT_TESTIMONY",
  "EXPERT_OPINION",
  "INTERNAL",
] as const;
const STRENGTHS = ["STRONG", "MODERATE", "WEAK", "ANECDOTAL"] as const;

type EvidenceSource = (typeof SOURCE_TYPES)[number];
type EvidenceStrength = (typeof STRENGTHS)[number];

export const evidenceTools: MCPToolDefinition[] = [
  {
    name: "evidence_list",
    description: "List evidence items for an initiative or task, optionally filtered by source type, strength, or cancer type",
    inputSchema: z.object({
      initiativeId: z.string().optional(),
      taskId: z.string().optional(),
      sourceType: z.enum(SOURCE_TYPES).optional(),
      strength: z.enum(STRENGTHS).optional(),
      cancerType: z.string().optional(),
      biomarker: z.string().optional(),
      limit: z.number().int().min(1).max(100).default(20).optional(),
      offset: z.number().int().min(0).default(0).optional(),
    }),
    handler: async (input) => {
      const { initiativeId, taskId, sourceType, strength, cancerType, biomarker, limit = 20, offset = 0 } = input as {
        initiativeId?: string; taskId?: string; sourceType?: string; strength?: string;
        cancerType?: string; biomarker?: string; limit?: number; offset?: number;
      };
      const where: Record<string, unknown> = {};
      if (initiativeId) where["initiativeId"] = initiativeId;
      if (taskId) where["taskId"] = taskId;
      if (sourceType) where["sourceType"] = sourceType;
      if (strength) where["strength"] = strength;
      if (cancerType) where["cancerTypes"] = { has: cancerType };
      if (biomarker) where["biomarkers"] = { has: biomarker };

      const [evidence, total] = await Promise.all([
        prisma.evidence.findMany({
          where,
          take: limit,
          skip: offset,
          orderBy: [{ strength: "asc" }, { publishedYear: "desc" }],
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
      sourceType: z.enum(SOURCE_TYPES).default("PUBMED"),
      journal: z.string().optional(),
      sourceUrl: z.string().optional(),
      sourceDoi: z.string().optional(),
      sourcePmid: z.string().optional(),
      publishedYear: z.number().int().optional(),
      authors: z.array(z.string()).default([]),
      cancerTypes: z.array(z.string()).default([]),
      biomarkers: z.array(z.string()).default([]),
      strength: z.enum(STRENGTHS).default("MODERATE"),
      tags: z.array(z.string()).default([]),
    }),
    handler: async (input) => {
      const data = input as Record<string, unknown>;
      const evidence = await prisma.evidence.create({
        data: data as Parameters<typeof prisma.evidence.create>[0]["data"],
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
      const searchData = (await searchRes.json()) as { esearchresult: { idlist: string[] } };
      const ids = searchData.esearchresult?.idlist ?? [];

      if (ids.length === 0) return { results: [], total: 0 };

      const summaryUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${ids.join(",")}&retmode=json`;
      const summaryRes = await fetch(summaryUrl);
      const summaryData = (await summaryRes.json()) as {
        result: Record<
          string,
          { uid: string; title: string; source: string; pubdate: string; authors: Array<{ name: string }>; doi?: string }
        >;
      };

      const results = ids
        .map((id) => {
          const item = summaryData.result[id];
          if (!item) return null;
          const yearMatch = (item.pubdate || "").match(/\d{4}/);
          return {
            sourcePmid: id,
            title: item.title,
            journal: item.source,
            publishedYear: yearMatch ? Number(yearMatch[0]) : undefined,
            authors: item.authors?.map((a) => a.name) ?? [],
            sourceDoi: item.doi,
            sourceType: "PUBMED" as EvidenceSource,
            cancerTypes: cancerType ? [cancerType] : [],
            biomarkers: biomarker ? [biomarker] : [],
            strength: "MODERATE" as EvidenceStrength,
          };
        })
        .filter(Boolean);

      return { results, total: results.length };
    },
  },
  {
    name: "evidence_bulk_create",
    description: "Create multiple evidence items at once — used by Research Intelligence agent",
    inputSchema: z.object({
      initiativeId: z.string().optional(),
      items: z.array(
        z.object({
          title: z.string(),
          summary: z.string().optional(),
          sourceType: z.enum(SOURCE_TYPES).default("PUBMED"),
          journal: z.string().optional(),
          sourceUrl: z.string().optional(),
          sourceDoi: z.string().optional(),
          sourcePmid: z.string().optional(),
          publishedYear: z.number().int().optional(),
          authors: z.array(z.string()).default([]),
          cancerTypes: z.array(z.string()).default([]),
          biomarkers: z.array(z.string()).default([]),
          strength: z.enum(STRENGTHS).default("MODERATE"),
        })
      ),
    }),
    handler: async (input) => {
      const { initiativeId, items } = input as {
        initiativeId?: string;
        items: Array<Record<string, unknown>>;
      };
      const created = await prisma.$transaction(
        items.map((item) =>
          prisma.evidence.create({
            data: {
              initiativeId,
              title: item.title as string,
              summary: item.summary as string | undefined,
              sourceType: (item.sourceType as EvidenceSource) ?? "PUBMED",
              journal: item.journal as string | undefined,
              sourceUrl: item.sourceUrl as string | undefined,
              sourceDoi: item.sourceDoi as string | undefined,
              sourcePmid: item.sourcePmid as string | undefined,
              publishedYear: item.publishedYear as number | undefined,
              authors: (item.authors as string[]) ?? [],
              cancerTypes: (item.cancerTypes as string[]) ?? [],
              biomarkers: (item.biomarkers as string[]) ?? [],
              strength: (item.strength as EvidenceStrength) ?? "MODERATE",
            } as Parameters<typeof prisma.evidence.create>[0]["data"],
          })
        )
      );
      return { created: created.length, evidence: created };
    },
  },
];
