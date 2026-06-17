import { z } from "zod";
import { prisma } from "@zeta/db";
import type { MCPToolDefinition } from "../registry.js";

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
];
