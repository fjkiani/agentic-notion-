import { z } from "zod";
import { prisma } from "@zeta/db";
import type { MCPToolDefinition } from "../registry.js";

export const biomarkerTools: MCPToolDefinition[] = [
  {
    name: "biomarker_list",
    description: "List cancer biomarkers tracked in CAID, optionally filtered by cancer type or FDA approval status",
    inputSchema: z.object({
      cancerType: z.string().optional(),
      fdaApproved: z.boolean().optional(),
      biomarkerType: z.string().optional(),
      advocacyPriority: z.string().optional(),
      limit: z.number().int().min(1).max(100).default(20).optional(),
    }),
    handler: async (input) => {
      const { cancerType, fdaApproved, biomarkerType, advocacyPriority, limit = 20 } = input as {
        cancerType?: string; fdaApproved?: boolean; biomarkerType?: string; advocacyPriority?: string; limit?: number;
      };
      const where: Record<string, unknown> = {};
      if (cancerType) where["cancerTypes"] = { has: cancerType };
      if (fdaApproved !== undefined) where["fdaApproved"] = fdaApproved;
      if (biomarkerType) where["biomarkerType"] = biomarkerType;
      if (advocacyPriority) where["advocacyPriority"] = advocacyPriority;

      const biomarkers = await prisma.biomarker.findMany({
        where,
        take: limit,
        orderBy: [{ advocacyPriority: "asc" }, { symbol: "asc" }],
      });
      return { biomarkers, total: biomarkers.length };
    },
  },
  {
    name: "biomarker_get",
    description: "Get a biomarker by symbol (e.g. BRCA1, EGFR, PD-L1) with full advocacy context",
    inputSchema: z.object({
      symbol: z.string(),
    }),
    handler: async (input) => {
      const { symbol } = input as { symbol: string };
      const biomarker = await prisma.biomarker.findUnique({
        where: { symbol: symbol.toUpperCase() },
        include: {
          campaigns: { include: { campaign: { select: { id: true, name: true, slug: true } } } },
          trials: { include: { trial: { select: { nctId: true, title: true, status: true } } } },
        },
      });
      if (!biomarker) throw new Error(`Biomarker ${symbol} not found`);
      return biomarker;
    },
  },
  {
    name: "biomarker_create",
    description: "Add a new cancer biomarker to the CAID database",
    inputSchema: z.object({
      symbol: z.string().min(1).max(50),
      name: z.string().min(2).max(200),
      aliases: z.array(z.string()).default([]),
      geneId: z.string().optional(),
      cancerTypes: z.array(z.string()).default([]),
      biomarkerType: z.enum(["GENETIC", "PROTEIN_EXPRESSION", "EPIGENETIC", "METABOLIC", "IMAGING", "LIQUID_BIOPSY"]).default("GENETIC"),
      clinicalSignificance: z.string().optional(),
      fdaApproved: z.boolean().default(false),
      fdaApprovedDrugs: z.array(z.string()).default([]),
      companionDx: z.array(z.string()).default([]),
      advocacyPriority: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]).default("MEDIUM"),
    }),
    handler: async (input) => {
      const data = input as Record<string, unknown>;
      const biomarker = await prisma.biomarker.upsert({
        where: { symbol: (data.symbol as string).toUpperCase() },
        create: { ...data, symbol: (data.symbol as string).toUpperCase() } as Parameters<typeof prisma.biomarker.create>[0]["data"],
        update: data as Parameters<typeof prisma.biomarker.update>[0]["data"],
      });
      return biomarker;
    },
  },
  {
    name: "biomarker_lookup_ncbi",
    description: "Look up a gene/biomarker in NCBI Gene database to get official name, aliases, and summary",
    inputSchema: z.object({
      symbol: z.string(),
    }),
    handler: async (input) => {
      const { symbol } = input as { symbol: string };
      const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=gene&term=${encodeURIComponent(symbol)}[Gene+Name]+AND+Homo+sapiens[Organism]&retmode=json&retmax=1`;
      const searchRes = await fetch(searchUrl);
      const searchData = await searchRes.json() as { esearchresult: { idlist: string[] } };
      const geneId = searchData.esearchresult?.idlist?.[0];
      if (!geneId) return { found: false, symbol };

      const summaryUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=gene&id=${geneId}&retmode=json`;
      const summaryRes = await fetch(summaryUrl);
      const summaryData = await summaryRes.json() as { result: Record<string, { name: string; description: string; otheraliases: string; summary: string; chromosome: string }> };
      const gene = summaryData.result[geneId];

      return {
        found: true,
        geneId,
        symbol: gene?.name,
        name: gene?.description,
        aliases: gene?.otheraliases?.split(", ").filter(Boolean) ?? [],
        summary: gene?.summary,
        chromosome: gene?.chromosome,
      };
    },
  },
];
