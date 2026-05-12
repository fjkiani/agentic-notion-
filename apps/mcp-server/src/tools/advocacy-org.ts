import { z } from "zod";
import { prisma } from "@zeta/db";
import { toSlug } from "@zeta/shared";
import type { MCPToolDefinition } from "../registry.js";

export const advocacyOrgTools: MCPToolDefinition[] = [
  {
    name: "org_list",
    description: "List advocacy organizations in a workspace, optionally filtered by cancer type or status",
    inputSchema: z.object({
      workspaceId: z.string(),
      cancerType: z.string().optional(),
      status: z.enum(["ACTIVE", "INACTIVE", "MERGED", "DISSOLVED"]).optional(),
      limit: z.number().int().min(1).max(100).default(20).optional(),
      offset: z.number().int().min(0).default(0).optional(),
    }),
    handler: async (input) => {
      const { workspaceId, cancerType, status, limit = 20, offset = 0 } = input as {
        workspaceId: string; cancerType?: string; status?: string; limit?: number; offset?: number;
      };
      const where: Record<string, unknown> = { workspaceId };
      if (cancerType) where["cancerTypes"] = { has: cancerType };
      if (status) where["status"] = status;

      const [orgs, total] = await Promise.all([
        prisma.advocacyOrg.findMany({
          where,
          take: limit,
          skip: offset,
          orderBy: { name: "asc" },
          include: {
            _count: { select: { campaigns: true, patientStories: true } },
          },
        }),
        prisma.advocacyOrg.count({ where }),
      ]);
      return { orgs, total, page: Math.floor(offset / limit) + 1, hasMore: offset + limit < total };
    },
  },
  {
    name: "org_get",
    description: "Get a specific advocacy organization by ID or slug with full details",
    inputSchema: z.object({
      id: z.string().optional(),
      workspaceId: z.string().optional(),
      slug: z.string().optional(),
    }),
    handler: async (input) => {
      const { id, workspaceId, slug } = input as { id?: string; workspaceId?: string; slug?: string };
      const org = await prisma.advocacyOrg.findFirst({
        where: id ? { id } : { workspaceId: workspaceId!, slug: slug! },
        include: {
          campaigns: {
            orderBy: { createdAt: "desc" },
            take: 10,
            include: { _count: { select: { initiatives: true } } },
          },
          contacts: true,
          _count: { select: { campaigns: true, patientStories: true, policyTargets: true } },
        },
      });
      if (!org) throw new Error("Organization not found");
      return org;
    },
  },
  {
    name: "org_create",
    description: "Create a new advocacy organization in a workspace",
    inputSchema: z.object({
      workspaceId: z.string(),
      name: z.string().min(2).max(200),
      description: z.string().optional(),
      mission: z.string().optional(),
      website: z.string().optional(),
      cancerTypes: z.array(z.string()).default([]),
      orgType: z.enum(["NONPROFIT", "FOUNDATION", "PATIENT_GROUP", "RESEARCH_INSTITUTE", "GOVERNMENT", "INDUSTRY", "COALITION"]).default("NONPROFIT"),
      headquarters: z.string().optional(),
      foundedYear: z.number().optional(),
    }),
    handler: async (input) => {
      const { workspaceId, name, ...rest } = input as {
        workspaceId: string; name: string; [key: string]: unknown;
      };
      const slug = toSlug(name);
      const org = await prisma.advocacyOrg.create({
        data: { workspaceId, name, slug, ...rest },
      });
      return org;
    },
  },
  {
    name: "org_update",
    description: "Update an advocacy organization's details",
    inputSchema: z.object({
      id: z.string(),
      name: z.string().optional(),
      description: z.string().optional(),
      mission: z.string().optional(),
      website: z.string().optional(),
      cancerTypes: z.array(z.string()).optional(),
      status: z.enum(["ACTIVE", "INACTIVE", "MERGED", "DISSOLVED"]).optional(),
      headquarters: z.string().optional(),
    }),
    handler: async (input) => {
      const { id, ...data } = input as { id: string; [key: string]: unknown };
      const org = await prisma.advocacyOrg.update({
        where: { id },
        data,
      });
      return org;
    },
  },
];
