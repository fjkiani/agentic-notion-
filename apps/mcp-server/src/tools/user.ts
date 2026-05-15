import { z } from "zod";
import { prisma } from "@zeta/db";
import type { MCPToolDefinition } from "../registry.js";

export const userTools: MCPToolDefinition[] = [
  {
    name: "user_upsert",
    description: "Create or update a user record (called by Clerk webhook on user.created / user.updated)",
    inputSchema: z.object({
      clerkId: z.string(),
      email: z.string().email(),
      name: z.string(),
      avatarUrl: z.string().nullable().optional(),
    }),
    handler: async (input) => {
      const { clerkId, email, name, avatarUrl } = input as {
        clerkId: string;
        email: string;
        name: string;
        avatarUrl?: string | null;
      };

      const user = await prisma.user.upsert({
        where: { clerkId },
        create: { clerkId, email, name, avatarUrl: avatarUrl ?? null },
        update: { email, name, avatarUrl: avatarUrl ?? null },
      });

      return { user };
    },
  },
  {
    name: "user_delete",
    description: "Delete a user record by Clerk ID (called by Clerk webhook on user.deleted)",
    inputSchema: z.object({
      clerkId: z.string(),
    }),
    handler: async (input) => {
      const { clerkId } = input as { clerkId: string };
      await prisma.user.deleteMany({ where: { clerkId } });
      return { deleted: true };
    },
  },
  {
    name: "user_list",
    description: "List all users",
    inputSchema: z.object({
      limit: z.number().int().min(1).max(100).default(50).optional(),
    }),
    handler: async (input) => {
      const { limit = 50 } = input as { limit?: number };
      const users = await prisma.user.findMany({
        take: limit,
        orderBy: { createdAt: "desc" },
        select: { id: true, clerkId: true, email: true, name: true, avatarUrl: true, createdAt: true },
      });
      return { users, total: users.length };
    },
  },
  {
    name: "user_get",
    description: "Get a user by ID or Clerk ID",
    inputSchema: z.object({
      id: z.string().optional(),
      clerkId: z.string().optional(),
    }),
    handler: async (input) => {
      const { id, clerkId } = input as { id?: string; clerkId?: string };
      const user = await prisma.user.findFirst({
        where: id ? { id } : { clerkId: clerkId! },
        select: { id: true, clerkId: true, email: true, name: true, avatarUrl: true, createdAt: true },
      });
      if (!user) throw new Error("User not found");
      return { user };
    },
  },
];
