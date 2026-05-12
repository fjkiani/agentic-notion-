import { z } from "zod";
import { prisma } from "@zeta/db";
import { toSlug } from "@zeta/shared";
import type { MCPToolDefinition } from "../registry.js";

export const patientStoryTools: MCPToolDefinition[] = [
  {
    name: "story_list",
    description: "List patient stories for an advocacy org, optionally filtered by cancer type or status",
    inputSchema: z.object({
      orgId: z.string(),
      cancerType: z.string().optional(),
      status: z.enum(["DRAFT", "REVIEW", "PUBLISHED", "ARCHIVED"]).optional(),
      limit: z.number().int().min(1).max(100).default(20).optional(),
    }),
    handler: async (input) => {
      const { orgId, cancerType, status, limit = 20 } = input as {
        orgId: string; cancerType?: string; status?: string; limit?: number;
      };
      const where: Record<string, unknown> = { orgId };
      if (cancerType) where["cancerType"] = cancerType;
      if (status) where["status"] = status;

      const stories = await prisma.patientStory.findMany({
        where,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          author: { select: { id: true, name: true } },
        },
      });
      return { stories, total: stories.length };
    },
  },
  {
    name: "story_get",
    description: "Get a patient story by ID or slug",
    inputSchema: z.object({
      id: z.string().optional(),
      orgId: z.string().optional(),
      slug: z.string().optional(),
    }),
    handler: async (input) => {
      const { id, orgId, slug } = input as { id?: string; orgId?: string; slug?: string };
      const story = await prisma.patientStory.findFirst({
        where: id ? { id } : { orgId: orgId!, slug: slug! },
        include: {
          author: { select: { id: true, name: true } },
          org: { select: { id: true, name: true, slug: true } },
        },
      });
      if (!story) throw new Error("Patient story not found");
      return story;
    },
  },
  {
    name: "story_create",
    description: "Create a new patient story/testimony for advocacy use",
    inputSchema: z.object({
      orgId: z.string(),
      title: z.string().min(2).max(200),
      content: z.string().min(10),
      summary: z.string().optional(),
      cancerType: z.string().min(2),
      diagnosisYear: z.number().optional(),
      stage: z.string().optional(),
      biomarkers: z.array(z.string()).default([]),
      treatmentPath: z.string().optional(),
      outcome: z.enum(["ONGOING", "REMISSION", "SURVIVOR", "DECEASED", "UNKNOWN"]).default("ONGOING"),
      isAnonymized: z.boolean().default(false),
      consentGiven: z.boolean().default(false),
      advocacyThemes: z.array(z.string()).default([]),
      authorId: z.string().optional(),
    }),
    handler: async (input) => {
      const { orgId, title, ...rest } = input as { orgId: string; title: string; [key: string]: unknown };
      const slug = toSlug(title);
      const story = await prisma.patientStory.create({
        data: { orgId, title, slug, ...rest } as Parameters<typeof prisma.patientStory.create>[0]["data"],
      });
      return story;
    },
  },
  {
    name: "story_update_status",
    description: "Update a patient story's publication status",
    inputSchema: z.object({
      id: z.string(),
      status: z.enum(["DRAFT", "REVIEW", "PUBLISHED", "ARCHIVED"]),
    }),
    handler: async (input) => {
      const { id, status } = input as { id: string; status: import("@zeta/db").StoryStatus };
      const story = await prisma.patientStory.update({
        where: { id },
        data: {
          status,
          publishedAt: status === "PUBLISHED" ? new Date() : undefined,
        },
      });
      return story;
    },
  },
];
