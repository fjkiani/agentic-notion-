import { z } from "zod";
import { prisma } from "@zeta/db";
import type { MCPToolDefinition } from "../registry.js";

export const clinicalTrialTools: MCPToolDefinition[] = [
  {
    name: "trial_search_ctgov",
    description: "Search ClinicalTrials.gov for trials relevant to a cancer type, biomarker, or intervention",
    inputSchema: z.object({
      query: z.string().min(2),
      cancerType: z.string().optional(),
      biomarker: z.string().optional(),
      phase: z.string().optional(),
      status: z.string().optional(),
      maxResults: z.number().int().min(1).max(20).default(10).optional(),
    }),
    handler: async (input) => {
      const { query, cancerType, biomarker, phase, status, maxResults = 10 } = input as {
        query: string; cancerType?: string; biomarker?: string; phase?: string; status?: string; maxResults?: number;
      };

      const params = new URLSearchParams({
        "query.term": [query, cancerType, biomarker].filter(Boolean).join(" "),
        "pageSize": String(maxResults),
        "format": "json",
      });
      if (phase) params.set("filter.advanced", `AREA[Phase]${phase}`);
      if (status) params.set("filter.overallStatus", status);

      const url = `https://clinicaltrials.gov/api/v2/studies?${params}`;
      const res = await fetch(url, { headers: { "Accept": "application/json" } });
      const data = await res.json() as {
        studies?: Array<{
          protocolSection: {
            identificationModule: { nctId: string; briefTitle: string };
            statusModule: { overallStatus: string; startDateStruct?: { date: string } };
            designModule?: { phases?: string[] };
            sponsorCollaboratorsModule?: { leadSponsor?: { name: string } };
            conditionsModule?: { conditions?: string[] };
            armsInterventionsModule?: { interventions?: Array<{ name: string }> };
            eligibilityModule?: { maximumAge?: string; eligibilityCriteria?: string };
            descriptionModule?: { briefSummary?: string };
          };
        }>;
      };

      const studies = data.studies ?? [];
      const results = studies.map((s) => {
        const p = s.protocolSection;
        return {
          nctId: p.identificationModule.nctId,
          title: p.identificationModule.briefTitle,
          status: p.statusModule.overallStatus,
          phase: p.designModule?.phases?.[0] ?? null,
          sponsor: p.sponsorCollaboratorsModule?.leadSponsor?.name,
          conditions: p.conditionsModule?.conditions ?? [],
          interventions: p.armsInterventionsModule?.interventions?.map((i) => i.name) ?? [],
          startDate: p.statusModule.startDateStruct?.date,
          summary: p.descriptionModule?.briefSummary,
        };
      });

      return { results, total: results.length };
    },
  },
  {
    name: "trial_save",
    description: "Save a clinical trial to the CAID database for tracking",
    inputSchema: z.object({
      nctId: z.string(),
      title: z.string(),
      phase: z.string().optional(),
      status: z.string().default("UNKNOWN"),
      sponsor: z.string().optional(),
      conditions: z.array(z.string()).default([]),
      interventions: z.array(z.string()).default([]),
      biomarkers: z.array(z.string()).default([]),
      primaryEndpoint: z.string().optional(),
      enrollment: z.number().optional(),
      startDate: z.string().optional(),
      completionDate: z.string().optional(),
      summary: z.string().optional(),
      advocacyNotes: z.string().optional(),
    }),
    handler: async (input) => {
      const { nctId, startDate, completionDate, ...rest } = input as {
        nctId: string; startDate?: string; completionDate?: string; [key: string]: unknown;
      };
      const trial = await prisma.clinicalTrial.upsert({
        where: { nctId },
        create: {
          nctId,
          ...rest,
          startDate: startDate ? new Date(startDate) : undefined,
          completionDate: completionDate ? new Date(completionDate) : undefined,
        } as Parameters<typeof prisma.clinicalTrial.create>[0]["data"],
        update: {
          ...rest,
          startDate: startDate ? new Date(startDate) : undefined,
          completionDate: completionDate ? new Date(completionDate) : undefined,
        } as Parameters<typeof prisma.clinicalTrial.update>[0]["data"],
      });
      return trial;
    },
  },
  {
    name: "trial_link_campaign",
    description: "Link a clinical trial to a campaign for tracking",
    inputSchema: z.object({
      campaignId: z.string(),
      trialId: z.string(),
      notes: z.string().optional(),
    }),
    handler: async (input) => {
      const { campaignId, trialId, notes } = input as { campaignId: string; trialId: string; notes?: string };
      const link = await prisma.campaignTrial.upsert({
        where: { campaignId_trialId: { campaignId, trialId } },
        create: { campaignId, trialId, notes },
        update: { notes },
      });
      return link;
    },
  },
  {
    name: "trial_list",
    description: "List clinical trials tracked in CAID, optionally filtered by status or cancer type",
    inputSchema: z.object({
      status: z.string().optional(),
      cancerType: z.string().optional(),
      biomarker: z.string().optional(),
      limit: z.number().int().min(1).max(100).default(20).optional(),
    }),
    handler: async (input) => {
      const { status, cancerType, biomarker, limit = 20 } = input as {
        status?: string; cancerType?: string; biomarker?: string; limit?: number;
      };
      const where: Record<string, unknown> = {};
      if (status) where["status"] = status;
      if (cancerType) where["conditions"] = { has: cancerType };
      if (biomarker) where["biomarkers"] = { has: biomarker };

      const trials = await prisma.clinicalTrial.findMany({
        where,
        take: limit,
        orderBy: { createdAt: "desc" },
      });
      return { trials, total: trials.length };
    },
  },
];
