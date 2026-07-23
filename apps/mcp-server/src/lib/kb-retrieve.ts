/**
 * Query-side KB retrieval for the MCP server (used to ground outreach drafts).
 * Reuses the local embedder + raw pgvector search.
 */
import { prisma } from "@zeta/db";
import { Prisma } from "@zeta/db";
import { embedQuery } from "./embeddings.js";

export interface RetrieveHit {
  docTitle: string;
  content: string;
  score: number;
}

export async function retrieveContext(
  workspaceId: string,
  query: string,
  opts: { orgId?: string | null; k?: number } = {}
): Promise<{ text: string; hits: RetrieveHit[] }> {
  const k = opts.k ?? 5;
  const qVec = await embedQuery(query);
  const vecLit = `[${qVec.join(",")}]`;
  const orgFilter = opts.orgId
    ? Prisma.sql`AND (c."orgId" = ${opts.orgId} OR c."orgId" IS NULL)`
    : Prisma.empty;

  const rows = await prisma.$queryRaw<
    Array<{ docTitle: string; content: string; distance: number }>
  >`
    SELECT d."title" AS "docTitle", c."content" AS "content",
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

  const hits = rows
    .map((r) => ({ docTitle: r.docTitle, content: r.content, score: 1 - Number(r.distance) }))
    .filter((h) => h.score >= 0.15);

  if (hits.length === 0) return { text: "", hits: [] };
  const text = hits.map((h, i) => `[KB ${i + 1}] (${h.docTitle}) ${h.content}`).join("\n\n");
  return { text, hits };
}

const OPENROUTER_API = "https://openrouter.ai/api/v1/chat/completions";

export async function llmCall(
  systemPrompt: string,
  userPrompt: string,
  maxTokens = 900,
  model = "openai/gpt-oss-120b:free"
): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY not set");
  const res = await fetch(OPENROUTER_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": "https://caid.onrender.com",
      "X-Title": "CAID Intelligence Platform",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: maxTokens,
    }),
  });
  if (!res.ok) throw new Error(`OpenRouter error ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return data.choices?.[0]?.message?.content ?? "";
}
