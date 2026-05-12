import { z } from "zod";
import { prisma } from "@zeta/db";
import { toSlug } from "@zeta/shared";
import type { MCPToolDefinition } from "../registry.js";

export const initiativeTools: MCPToolDefinition[] = [
  {
    name: "initiative_list",
    description: "List initiatives for a campaign, optionally filtered by type or status",
    inputSchema: z.object({
      campaignId: z.string(),
      type: z.string().optional(),
      status: z.string().optional(),
      limit: z.number().int().min(1).max(100).default(20).optional(),
    }),
    handler: async (input) => {
      const { campaignId, type, status, limit = 20 } = input as {
        campaignId: string; type?: string; status?: string; limit?: number;
      };
      const where: Record<string, unknown> = { campaignId };
      if (type) where["type"] = type;
      if (status) where["status"] = status;

      const initiatives = await prisma.initiative.findMany({
        where,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          _count: { select: { tasks: true, evidence: true } },
        },
      });
      return { initiatives, total: initiatives.length };
    },
  },
  {
    name: "initiative_get",
    description: "Get an initiative with all tasks and evidence",
    inputSchema: z.object({
      id: z.string().optional(),
      campaignId: z.string().optional(),
      slug: z.string().optional(),
    }),
    handler: async (input) => {
      const { id, campaignId, slug } = input as { id?: string; campaignId?: string; slug?: string };
      const initiative = await prisma.initiative.findFirst({
        where: id ? { id } : { campaignId: campaignId!, slug: slug! },
        include: {
          tasks: {
            orderBy: { createdAt: "desc" },
            include: {
              assignee: { select: { id: true, name: true, avatarUrl: true } },
              _count: { select: { comments: true, subTasks: true } },
            },
          },
          evidence: { orderBy: { relevanceScore: "desc" }, take: 20 },
          _count: { select: { tasks: true, evidence: true } },
        },
      });
      if (!initiative) throw new Error("Initiative not found");
      return initiative;
    },
  },
  {
    name: "initiative_create",
    description: "Create a new initiative (workstream) within a campaign",
    inputSchema: z.object({
      campaignId: z.string(),
      name: z.string().min(2).max(200),
      description: z.string().optional(),
      type: z.enum(["POLICY_ADVOCACY", "RESEARCH_FUNDING", "PATIENT_SUPPORT", "AWARENESS", "COALITION_BUILDING", "REGULATORY_ENGAGEMENT", "CLINICAL_TRIAL_ACCESS", "BIOMARKER_ADVOCACY", "MEDIA_CAMPAIGN", "GENERAL"]).default("GENERAL"),
      status: z.enum(["BACKLOG", "PLANNING", "IN_PROGRESS", "REVIEW", "BLOCKED", "COMPLETED", "CANCELLED"]).default("BACKLOG"),
      priority: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]).default("MEDIUM"),
      startDate: z.string().optional(),
      dueDate: z.string().optional(),
      successCriteria: z.string().optional(),
    }),
    handler: async (input) => {
      const { campaignId, name, ...rest } = input as { campaignId: string; name: string; [key: string]: unknown };
      const slug = toSlug(name);
      const initiative = await prisma.initiative.create({
        data: {
          campaignId,
          name,
          slug,
          ...rest,
          startDate: (rest.startDate as string) ? new Date(rest.startDate as string) : undefined,
          dueDate: (rest.dueDate as string) ? new Date(rest.dueDate as string) : undefined,
        },
      });
      return initiative;
    },
  },
  {
    name: "initiative_update",
    description: "Update an initiative's status, priority, or other fields",
    inputSchema: z.object({
      id: z.string(),
      name: z.string().optional(),
      description: z.string().optional(),
      status: z.string().optional(),
      priority: z.string().optional(),
      dueDate: z.string().optional(),
      successCriteria: z.string().optional(),
    }),
    handler: async (input) => {
      const { id, ...data } = input as { id: string; [key: string]: unknown };
      const initiative = await prisma.initiative.update({
        where: { id },
        data: {
          ...data,
          dueDate: (data.dueDate as string) ? new Date(data.dueDate as string) : undefined,
        },
      });
      return initiative;
    },
  },
];
