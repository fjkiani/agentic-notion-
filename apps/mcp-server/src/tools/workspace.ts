import { z } from "zod";
import { prisma } from "@zeta/db";
import { toSlug } from "@zeta/shared";
import type { MCPToolDefinition } from "../registry.js";

export const workspaceTools: MCPToolDefinition[] = [
  {
    name: "workspace_list",
    description: "List all workspaces the current user has access to",
    inputSchema: z.object({
      limit: z.number().int().min(1).max(100).default(20).optional(),
    }),
    handler: async (input) => {
      const { limit = 20 } = input as { limit?: number };
      const workspaces = await prisma.workspace.findMany({
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          _count: {
            select: { advocacyOrgs: true, agentRuns: true },
          },
        },
      });
      return { workspaces, total: workspaces.length };
    },
  },
  {
    name: "workspace_get",
    description: "Get a workspace by ID or slug",
    inputSchema: z.object({
      id: z.string().optional(),
      slug: z.string().optional(),
    }),
    handler: async (input) => {
      const { id, slug } = input as { id?: string; slug?: string };
      const workspace = await prisma.workspace.findFirst({
        where: id ? { id } : { slug: slug! },
        include: {
          _count: {
            select: { advocacyOrgs: true, agentRuns: true, pages: true },
          },
        },
      });
      if (!workspace) throw new Error("Workspace not found");
      return workspace;
    },
  },
  {
    name: "workspace_create",
    description: "Create a new workspace",
    inputSchema: z.object({
      name: z.string().min(2).max(100),
      slug: z.string().optional(),
      description: z.string().optional(),
    }),
    handler: async (input) => {
      const { name, slug, description } = input as { name: string; slug?: string; description?: string };
      const finalSlug = slug ?? toSlug(name);
      const workspace = await prisma.workspace.create({
        data: { name, slug: finalSlug, description },
      });
      return workspace;
    },
  },
  {
    name: "workspace_dashboard",
    description: "Get dashboard statistics for a workspace — total orgs, campaigns, tasks, evidence, agent runs",
    inputSchema: z.object({
      workspaceId: z.string(),
    }),
    handler: async (input) => {
      const { workspaceId } = input as { workspaceId: string };
      const [orgs, campaigns, initiatives, tasks, evidence, trials, biomarkers, stories, agentRuns] = await Promise.all([
        prisma.advocacyOrg.count({ where: { workspaceId } }),
        prisma.campaign.count({ where: { org: { workspaceId } } }),
        prisma.initiative.count({ where: { campaign: { org: { workspaceId } } } }),
        prisma.task.count({ where: { initiative: { campaign: { org: { workspaceId } } } } }),
        prisma.evidence.count({ where: { initiative: { campaign: { org: { workspaceId } } } } }),
        prisma.clinicalTrial.count(),
        prisma.biomarker.count(),
        prisma.patientStory.count({ where: { org: { workspaceId } } }),
        prisma.agentRun.count({ where: { workspaceId, startedAt: { gte: new Date(Date.now() - 86400000) } } }),
      ]);
      const completedTasks = await prisma.task.count({
        where: { initiative: { campaign: { org: { workspaceId } } }, status: "DONE" },
      });
      const activeCampaigns = await prisma.campaign.count({
        where: { org: { workspaceId }, status: "ACTIVE" },
      });
      return {
        workspaceId,
        totalOrgs: orgs,
        totalCampaigns: campaigns,
        activeCampaigns,
        totalInitiatives: initiatives,
        totalTasks: tasks,
        completedTasks,
        totalEvidence: evidence,
        totalTrials: trials,
        totalBiomarkers: biomarkers,
        totalPatientStories: stories,
        agentRunsToday: agentRuns,
      };
    },
  },
];
