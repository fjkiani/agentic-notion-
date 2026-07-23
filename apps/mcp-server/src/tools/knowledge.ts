import { z } from "zod";
import { prisma } from "@zeta/db";
import { Prisma } from "@zeta/db";
import type { MCPToolDefinition } from "../registry.js";
import { embedQuery } from "../lib/embeddings.js";

function toVectorLiteral(vec: number[]): string {
  return `[${vec.join(",")}]`;
}

export const knowledgeTools: MCPToolDefinition[] = [
  {
    name: "kb_search",
    description:
      "Semantic search over the knowledge base (uploaded grant guidelines, past applications, funder docs). Returns the most relevant passages by meaning. Use this to ground grant strategy, dossiers, and outreach in the organization's own documents. Optionally scope to a specific org (also returns workspace-global docs).",
    inputSchema: z.object({
      workspaceId: z.string(),
      query: z.string().min(2),
      orgId: z.string().optional(),
      k: z.number().int().min(1).max(20).default(6).optional(),
    }),
    handler: async (input) => {
      const { workspaceId, query, orgId, k = 6 } = input as {
        workspaceId: string;
        query: string;
        orgId?: string;
        k?: number;
      };

      const qVec = await embedQuery(query);
      const vecLit = toVectorLiteral(qVec);
      const orgFilter = orgId
        ? Prisma.sql`AND (c."orgId" = ${orgId} OR c."orgId" IS NULL)`
        : Prisma.empty;

      const rows = await prisma.$queryRaw<
        Array<{
          chunkId: string;
          docId: string;
          docTitle: string;
          fileName: string;
          content: string;
          distance: number;
          chunkIndex: number;
        }>
      >`
        SELECT
          c."id"          AS "chunkId",
          c."docId"       AS "docId",
          d."title"       AS "docTitle",
          d."fileName"    AS "fileName",
          c."content"     AS "content",
          c."chunkIndex"  AS "chunkIndex",
          (c."embedding" <=> ${vecLit}::vector) AS "distance"
        FROM "KnowledgeChunk" c
        JOIN "KnowledgeDoc" d ON d."id" = c."docId"
        WHERE c."workspaceId" = ${workspaceId}
          AND c."embedding" IS NOT NULL
          AND d."status" = 'READY'
          ${orgFilter}
        ORDER BY c."embedding" <=> ${vecLit}::vector
        LIMIT ${k}
      `;

      const hits = rows.map((r) => ({
        docTitle: r.docTitle,
        fileName: r.fileName,
        content: r.content,
        score: Number((1 - Number(r.distance)).toFixed(4)),
        chunkIndex: r.chunkIndex,
        docId: r.docId,
      }));

      return { hits, total: hits.length, query };
    },
  },
  {
    name: "kb_list_docs",
    description:
      "List knowledge-base documents for a workspace (optionally scoped to an org). Shows title, file type, processing status, chunk count, and tags.",
    inputSchema: z.object({
      workspaceId: z.string(),
      orgId: z.string().optional(),
    }),
    handler: async (input) => {
      const { workspaceId, orgId } = input as { workspaceId: string; orgId?: string };
      const docs = await prisma.knowledgeDoc.findMany({
        where: { workspaceId, ...(orgId ? { orgId } : {}) },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          title: true,
          fileName: true,
          mimeType: true,
          sizeBytes: true,
          status: true,
          tags: true,
          orgId: true,
          grantId: true,
          createdAt: true,
          _count: { select: { chunks: true } },
        },
      });
      return { docs, total: docs.length };
    },
  },
];
