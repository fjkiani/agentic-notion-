import { z } from "zod";
import { prisma } from "@zeta/db";
import { toSlug } from "@zeta/shared";
import type { MCPToolDefinition } from "../registry.js";

export const campaignTools: MCPToolDefinition[] = [
  {
    name: "campaign_list",
    description: "List campaigns for an advocacy org, optionally filtered by status or cancer type",
    inputSchema: z.object({
      orgId: z.string(),
      status: z.enum(["PLANNING", "ACTIVE", "PAUSED", "COMPLETED", "ARCHIVED"]).optional(),
      cancerType: z.string().optional(),
      limit: z.number().int().min(1).max(100).default(20).optional(),
    }),
    handler: async (input) => {
      const { orgId, status, cancerType, limit = 20 } = input as {
        orgId: string; status?: string; cancerType?: string; limit?: number;
      };
      const where: Record<string, unknown> = { orgId };
      if (status) where["status"] = status;
      if (cancerType) where["cancerTypes"] = { has: cancerType };

      const campaigns = await prisma.campaign.findMany({
        where,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          _count: { select: { initiatives: true, policyTargets: true } },
        },
      });
      return { campaigns, total: campaigns.length };
    },
  },
  {
    name: "campaign_get",
    description: "Get a campaign with full details including initiatives, KPIs, and linked trials",
    inputSchema: z.object({
      id: z.string().optional(),
      orgId: z.string().optional(),
      slug: z.string().optional(),
    }),
    handler: async (input) => {
      const { id, orgId, slug } = input as { id?: string; orgId?: string; slug?: string };
      const campaign = await prisma.campaign.findFirst({
        where: id ? { id } : { orgId: orgId!, slug: slug! },
        include: {
          initiatives: {
            orderBy: { createdAt: "desc" },
            include: { _count: { select: { tasks: true, evidence: true } } },
          },
          policyTargets: true,
          clinicalTrials: { include: { trial: true } },
          biomarkers: { include: { biomarker: true } },
          _count: { select: { initiatives: true } },
        },
      });
      if (!campaign) throw new Error("Campaign not found");
      return campaign;
    },
  },
  {
    name: "campaign_create",
    description: "Create a new advocacy campaign within an organization",
    inputSchema: z.object({
      orgId: z.string(),
      name: z.string().min(2).max(200),
      description: z.string().optional(),
      objective: z.string().optional(),
      cancerTypes: z.array(z.string()).default([]),
      targetAudience: z.array(z.string()).default([]),
      status: z.enum(["PLANNING", "ACTIVE", "PAUSED", "COMPLETED", "ARCHIVED"]).default("PLANNING"),
      priority: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]).default("MEDIUM"),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      budget: z.number().optional(),
      tags: z.array(z.string()).default([]),
    }),
    handler: async (input) => {
      const { orgId, name, ...rest } = input as { orgId: string; name: string; [key: string]: unknown };
      const slug = toSlug(name);
      const campaign = await prisma.campaign.create({
        data: {
          orgId,
          name,
          slug,
          ...rest,
          startDate: (rest.startDate as string) ? new Date(rest.startDate as string) : undefined,
          endDate: (rest.endDate as string) ? new Date(rest.endDate as string) : undefined,
        },
      });
      return campaign;
    },
  },
  {
    name: "campaign_update",
    description: "Update a campaign's status, priority, KPIs, or other fields",
    inputSchema: z.object({
      id: z.string(),
      name: z.string().optional(),
      description: z.string().optional(),
      objective: z.string().optional(),
      status: z.enum(["PLANNING", "ACTIVE", "PAUSED", "COMPLETED", "ARCHIVED"]).optional(),
      priority: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]).optional(),
      cancerTypes: z.array(z.string()).optional(),
      targetAudience: z.array(z.string()).optional(),
      tags: z.array(z.string()).optional(),
      kpis: z.array(z.object({
        metric: z.string(),
        target: z.number(),
        current: z.number(),
      })).optional(),
    }),
    handler: async (input) => {
      const { id, ...data } = input as { id: string; [key: string]: unknown };
      const campaign = await prisma.campaign.update({
        where: { id },
        data,
      });
      return campaign;
    },
  },
  {
    name: "campaign_timeline",
    description: "Get a campaign's timeline — all initiatives and tasks with dates for Gantt/timeline view",
    inputSchema: z.object({
      campaignId: z.string(),
    }),
    handler: async (input) => {
      const { campaignId } = input as { campaignId: string };
      const initiatives = await prisma.initiative.findMany({
        where: { campaignId },
        include: {
          tasks: {
            where: { dueDate: { not: null } },
            select: { id: true, title: true, status: true, priority: true, dueDate: true, completedAt: true },
          },
        },
        orderBy: { startDate: "asc" },
      });
      const policyTargets = await prisma.policyTarget.findMany({
        where: { campaignId },
        select: { id: true, title: true, status: true, priority: true, deadline: true },
      });
      return { initiatives, policyTargets };
    },
  },
];
