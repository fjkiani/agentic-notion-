import { z } from "zod";
import { prisma } from "@zeta/db";
import { toSlug } from "@zeta/shared";
import type { MCPToolDefinition } from "../registry.js";

export const taskTools: MCPToolDefinition[] = [
  {
    name: "task_list",
    description: "List tasks for an initiative or across a campaign, with optional status/priority filters",
    inputSchema: z.object({
      initiativeId: z.string().optional(),
      campaignId: z.string().optional(),
      status: z.string().optional(),
      priority: z.string().optional(),
      assigneeId: z.string().optional(),
      agentCreated: z.boolean().optional(),
      limit: z.number().int().min(1).max(200).default(50).optional(),
      offset: z.number().int().min(0).default(0).optional(),
    }),
    handler: async (input) => {
      const { initiativeId, campaignId, status, priority, assigneeId, agentCreated, limit = 50, offset = 0 } = input as {
        initiativeId?: string; campaignId?: string; status?: string; priority?: string;
        assigneeId?: string; agentCreated?: boolean; limit?: number; offset?: number;
      };

      const where: Record<string, unknown> = {};
      if (initiativeId) where["initiativeId"] = initiativeId;
      if (campaignId) where["initiative"] = { campaignId };
      if (status) where["status"] = status;
      if (priority) where["priority"] = priority;
      if (assigneeId) where["assigneeId"] = assigneeId;
      if (agentCreated !== undefined) where["agentCreated"] = agentCreated;

      const [tasks, total] = await Promise.all([
        prisma.task.findMany({
          where,
          take: limit,
          skip: offset,
          orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
          include: {
            assignee: { select: { id: true, name: true, avatarUrl: true } },
            _count: { select: { comments: true, subTasks: true } },
          },
        }),
        prisma.task.count({ where }),
      ]);
      return { tasks, total, hasMore: offset + limit < total };
    },
  },
  {
    name: "task_get",
    description: "Get a task with full details including subtasks, comments, and evidence",
    inputSchema: z.object({
      id: z.string(),
    }),
    handler: async (input) => {
      const { id } = input as { id: string };
      const task = await prisma.task.findUnique({
        where: { id },
        include: {
          assignee: { select: { id: true, name: true, avatarUrl: true } },
          creator: { select: { id: true, name: true } },
          subTasks: {
            include: { assignee: { select: { id: true, name: true } } },
          },
          comments: {
            include: { author: { select: { id: true, name: true, avatarUrl: true } } },
            orderBy: { createdAt: "asc" },
          },
          evidence: { orderBy: { relevanceScore: "desc" } },
          initiative: {
            select: { id: true, name: true, slug: true, campaign: { select: { id: true, name: true, slug: true } } },
          },
        },
      });
      if (!task) throw new Error("Task not found");
      return task;
    },
  },
  {
    name: "task_create",
    description: "Create a new task within an initiative. Can be called by agents to create work items.",
    inputSchema: z.object({
      initiativeId: z.string(),
      title: z.string().min(2).max(500),
      description: z.string().optional(),
      type: z.enum(["ACTION", "RESEARCH", "MEETING", "DOCUMENT", "OUTREACH", "REVIEW", "APPROVAL", "MILESTONE"]).default("ACTION"),
      status: z.enum(["TODO", "IN_PROGRESS", "IN_REVIEW", "BLOCKED", "DONE", "CANCELLED"]).default("TODO"),
      priority: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]).default("MEDIUM"),
      assigneeId: z.string().optional(),
      creatorId: z.string(),
      dueDate: z.string().optional(),
      estimatedHours: z.number().optional(),
      storyPoints: z.number().optional(),
      labels: z.array(z.string()).default([]),
      agentCreated: z.boolean().default(false),
      agentRunId: z.string().optional(),
      parentTaskId: z.string().optional(),
    }),
    handler: async (input) => {
      const i = input as {
        initiativeId: string; title: string; description?: string;
        type?: import("@zeta/db").TaskType; status?: import("@zeta/db").TaskStatus;
        priority?: import("@zeta/db").Priority; assigneeId?: string; creatorId: string;
        dueDate?: string; estimatedHours?: number; storyPoints?: number;
        labels?: string[]; agentCreated?: boolean; agentRunId?: string; parentTaskId?: string;
      };
      const baseSlug = toSlug(i.title);
      const count = await prisma.task.count({ where: { initiativeId: i.initiativeId } });
      const slug = `${baseSlug}-${count + 1}`;

      const task = await prisma.task.create({
        data: {
          initiativeId: i.initiativeId,
          slug,
          title: i.title,
          description: i.description,
          type: i.type ?? "ACTION",
          status: i.status ?? "TODO",
          priority: i.priority ?? "MEDIUM",
          assigneeId: i.assigneeId,
          creatorId: i.creatorId,
          dueDate: i.dueDate ? new Date(i.dueDate) : undefined,
          estimatedHours: i.estimatedHours,
          storyPoints: i.storyPoints,
          labels: i.labels ?? [],
          agentCreated: i.agentCreated ?? false,
          agentRunId: i.agentRunId,
          parentTaskId: i.parentTaskId,
        },
        include: {
          assignee: { select: { id: true, name: true } },
        },
      });
      return task;
    },
  },
  {
    name: "task_update",
    description: "Update a task — change status, priority, assignee, or any other field",
    inputSchema: z.object({
      id: z.string(),
      title: z.string().optional(),
      description: z.string().optional(),
      status: z.enum(["TODO", "IN_PROGRESS", "IN_REVIEW", "BLOCKED", "DONE", "CANCELLED"]).optional(),
      priority: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]).optional(),
      assigneeId: z.string().optional(),
      dueDate: z.string().optional(),
      labels: z.array(z.string()).optional(),
      storyPoints: z.number().optional(),
    }),
    handler: async (input) => {
      const { id, ...data } = input as { id: string; [key: string]: unknown };
      const updateData: Record<string, unknown> = { ...data };
      if (data.dueDate) updateData["dueDate"] = new Date(data.dueDate as string);
      if (data.status === "DONE") updateData["completedAt"] = new Date();

      const task = await prisma.task.update({
        where: { id },
        data: updateData,
        include: { assignee: { select: { id: true, name: true } } },
      });
      return task;
    },
  },
  {
    name: "task_bulk_create",
    description: "Create multiple tasks at once — used by agents to populate a sprint or initiative",
    inputSchema: z.object({
      initiativeId: z.string(),
      creatorId: z.string(),
      agentRunId: z.string().optional(),
      tasks: z.array(z.object({
        title: z.string(),
        description: z.string().optional(),
        type: z.string().default("ACTION"),
        priority: z.string().default("MEDIUM"),
        dueDate: z.string().optional(),
        labels: z.array(z.string()).default([]),
        storyPoints: z.number().optional(),
      })),
    }),
    handler: async (input) => {
      const { initiativeId, creatorId, agentRunId, tasks } = input as {
        initiativeId: string; creatorId: string; agentRunId?: string; tasks: Array<Record<string, unknown>>;
      };
      const count = await prisma.task.count({ where: { initiativeId } });
      const created = await prisma.$transaction(
        tasks.map((t, i) =>
          prisma.task.create({
            data: {
              initiativeId,
              creatorId,
              agentRunId,
              slug: `${toSlug(t.title as string)}-${count + i + 1}`,
              title: t.title as string,
              description: t.description as string | undefined,
              type: (t.type as import("@zeta/db").TaskType) ?? "ACTION",
              priority: (t.priority as import("@zeta/db").Priority) ?? "MEDIUM",
              status: "TODO",
              dueDate: (t.dueDate as string) ? new Date(t.dueDate as string) : undefined,
              labels: (t.labels as string[]) ?? [],
              storyPoints: t.storyPoints as number | undefined,
              agentCreated: true,
            },
          })
        )
      );
      return { created: created.length, tasks: created };
    },
  },
  {
    name: "task_kanban",
    description: "Get all tasks for a campaign/initiative organized by status columns for Kanban view",
    inputSchema: z.object({
      campaignId: z.string().optional(),
      initiativeId: z.string().optional(),
    }),
    handler: async (input) => {
      const { campaignId, initiativeId } = input as { campaignId?: string; initiativeId?: string };
      const where: Record<string, unknown> = {};
      if (initiativeId) where["initiativeId"] = initiativeId;
      if (campaignId) where["initiative"] = { campaignId };

      const tasks = await prisma.task.findMany({
        where,
        orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
        include: {
          assignee: { select: { id: true, name: true, avatarUrl: true } },
          _count: { select: { comments: true } },
        },
      });

      const columns = {
        TODO: tasks.filter((t) => t.status === "TODO"),
        IN_PROGRESS: tasks.filter((t) => t.status === "IN_PROGRESS"),
        IN_REVIEW: tasks.filter((t) => t.status === "IN_REVIEW"),
        BLOCKED: tasks.filter((t) => t.status === "BLOCKED"),
        DONE: tasks.filter((t) => t.status === "DONE"),
      };
      return { columns, total: tasks.length };
    },
  },
];
