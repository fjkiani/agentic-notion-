import { z } from "zod";
import { prisma } from "@zeta/db";
import { toSlug } from "@zeta/shared";
import type { MCPToolDefinition } from "../registry.js";

export const coalitionTools: MCPToolDefinition[] = [
  {
    name: "coalition_list",
    description: "List advocacy coalitions, optionally filtered by status or focus area",
    inputSchema: z.object({
      status: z.enum(["FORMING", "ACTIVE", "INACTIVE", "DISSOLVED"]).optional(),
      focusArea: z.string().optional(),
      limit: z.number().int().min(1).max(100).default(20).optional(),
    }),
    handler: async (input) => {
      const { status, focusArea, limit = 20 } = input as { status?: string; focusArea?: string; limit?: number };
      const where: Record<string, unknown> = {};
      if (status) where["status"] = status;
      if (focusArea) where["focusAreas"] = { has: focusArea };

      const coalitions = await prisma.coalition.findMany({
        where,
        take: limit,
        orderBy: { name: "asc" },
        include: {
          _count: { select: { members: true, policyTargets: true } },
        },
      });
      return { coalitions, total: coalitions.length };
    },
  },
  {
    name: "coalition_create",
    description: "Create a new advocacy coalition",
    inputSchema: z.object({
      name: z.string().min(2).max(200),
      description: z.string().optional(),
      focusAreas: z.array(z.string()).default([]),
      status: z.enum(["FORMING", "ACTIVE", "INACTIVE", "DISSOLVED"]).default("FORMING"),
      website: z.string().optional(),
    }),
    handler: async (input) => {
      const { name, ...rest } = input as { name: string; [key: string]: unknown };
      const slug = toSlug(name);
      const coalition = await prisma.coalition.create({
        data: { name, slug, ...rest } as Parameters<typeof prisma.coalition.create>[0]["data"],
      });
      return coalition;
    },
  },
  {
    name: "coalition_add_member",
    description: "Add an advocacy organization to a coalition",
    inputSchema: z.object({
      coalitionId: z.string(),
      orgId: z.string(),
      role: z.string().optional(),
    }),
    handler: async (input) => {
      const { coalitionId, orgId, role } = input as { coalitionId: string; orgId: string; role?: string };
      const member = await prisma.coalitionMember.upsert({
        where: { coalitionId_orgId: { coalitionId, orgId } },
        create: { coalitionId, orgId, role },
        update: { role },
      });
      return member;
    },
  },
  {
    name: "policy_target_list",
    description: "List policy targets (legislation, regulations, coverage policies) for an org or campaign",
    inputSchema: z.object({
      orgId: z.string().optional(),
      campaignId: z.string().optional(),
      status: z.string().optional(),
      targetType: z.string().optional(),
      limit: z.number().int().min(1).max(100).default(20).optional(),
    }),
    handler: async (input) => {
      const { orgId, campaignId, status, targetType, limit = 20 } = input as {
        orgId?: string; campaignId?: string; status?: string; targetType?: string; limit?: number;
      };
      const where: Record<string, unknown> = {};
      if (orgId) where["orgId"] = orgId;
      if (campaignId) where["campaignId"] = campaignId;
      if (status) where["status"] = status;
      if (targetType) where["targetType"] = targetType;

      const targets = await prisma.policyTarget.findMany({
        where,
        take: limit,
        orderBy: [{ priority: "asc" }, { deadline: "asc" }],
      });
      return { targets, total: targets.length };
    },
  },
  {
    name: "policy_target_create",
    description: "Create a new policy target (bill, regulation, coverage policy) to track and advocate for",
    inputSchema: z.object({
      orgId: z.string().optional(),
      campaignId: z.string().optional(),
      title: z.string().min(2).max(300),
      description: z.string().optional(),
      targetType: z.enum(["LEGISLATION", "REGULATION", "GUIDANCE", "COVERAGE_POLICY", "REIMBURSEMENT", "GRANT_PROGRAM"]).default("LEGISLATION"),
      jurisdiction: z.string().optional(),
      agency: z.string().optional(),
      billNumber: z.string().optional(),
      status: z.enum(["MONITORING", "ACTIVE_ENGAGEMENT", "SUBMITTED", "UNDER_REVIEW", "PASSED", "FAILED", "WITHDRAWN"]).default("MONITORING"),
      priority: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]).default("MEDIUM"),
      deadline: z.string().optional(),
    }),
    handler: async (input) => {
      const { deadline, ...rest } = input as { deadline?: string; [key: string]: unknown };
      const target = await prisma.policyTarget.create({
        data: {
          ...rest,
          deadline: deadline ? new Date(deadline) : undefined,
        } as Parameters<typeof prisma.policyTarget.create>[0]["data"],
      });
      return target;
    },
  },
];
