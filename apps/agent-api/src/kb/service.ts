/**
 * Knowledge base service: ingest → extract → chunk → embed → store,
 * plus semantic (pgvector cosine) retrieval.
 *
 * The `KnowledgeChunk.embedding` column is a pgvector `vector(384)` that Prisma
 * models as `Unsupported(...)`. Prisma cannot read/write Unsupported columns
 * through its typed API, so all embedding writes/reads use raw SQL with a
 * `::vector` cast and the `<=>` cosine-distance operator.
 */
import { prisma } from "@zeta/db";
import { Prisma } from "@zeta/db";
import { extractText } from "./extract.js";
import { splitText, estimateTokens } from "./chunk.js";
import { embedTexts, embedQuery } from "./embeddings.js";

export interface IngestInput {
  workspaceId: string;
  orgId?: string | null;
  grantId?: string | null;
  title: string;
  fileName: string;
  mimeType: string;
  buffer: Buffer;
  tags?: string[];
  sourceType?: string;
}

export interface SearchHit {
  chunkId: string;
  docId: string;
  docTitle: string;
  fileName: string;
  content: string;
  score: number; // cosine similarity in [−1, 1]; higher = more similar
  chunkIndex: number;
  orgId: string | null;
}

/** pgvector literal: "[0.1,0.2,...]" */
function toVectorLiteral(vec: number[]): string {
  return `[${vec.join(",")}]`;
}

/**
 * Create the doc row immediately (status PENDING) and return its id.
 * Ingestion (extract/chunk/embed) is kicked off separately so the HTTP
 * request can return fast.
 */
export async function createDoc(input: IngestInput): Promise<string> {
  const doc = await prisma.knowledgeDoc.create({
    data: {
      workspaceId: input.workspaceId,
      orgId: input.orgId ?? null,
      grantId: input.grantId ?? null,
      title: input.title,
      fileName: input.fileName,
      mimeType: input.mimeType,
      sizeBytes: input.buffer.length,
      fileData: input.buffer,
      tags: input.tags ?? [],
      sourceType: input.sourceType ?? "upload",
      status: "PENDING",
    },
    select: { id: true },
  });
  return doc.id;
}

/**
 * Full processing pipeline for a previously-created doc: extract text,
 * chunk, embed, and store chunks with their vectors. Idempotent — clears
 * any existing chunks first. Updates doc status along the way.
 */
export async function processDoc(docId: string): Promise<{ chunks: number; chars: number }> {
  const doc = await prisma.knowledgeDoc.findUnique({ where: { id: docId } });
  if (!doc) throw new Error(`KnowledgeDoc ${docId} not found`);

  await prisma.knowledgeDoc.update({
    where: { id: docId },
    data: { status: "PROCESSING", error: null },
  });

  try {
    const buf = Buffer.from(doc.fileData);
    const { text } = await extractText(buf, doc.fileName, doc.mimeType);

    if (!text || text.trim().length === 0) {
      throw new Error("No extractable text found in file");
    }

    const chunks = splitText(text);
    if (chunks.length === 0) {
      throw new Error("Text produced zero chunks");
    }

    // Embed in batches to bound memory.
    const BATCH = 32;
    const vectors: number[][] = [];
    for (let i = 0; i < chunks.length; i += BATCH) {
      const batch = chunks.slice(i, i + BATCH);
      vectors.push(...(await embedTexts(batch)));
    }

    // Replace existing chunks for this doc.
    await prisma.knowledgeChunk.deleteMany({ where: { docId } });

    // Insert chunks with embeddings via raw SQL (Unsupported vector column).
    for (let i = 0; i < chunks.length; i++) {
      const content = chunks[i];
      const vector = vectors[i];
      if (content === undefined || vector === undefined) continue;
      const id = `kc_${docId}_${i}`;
      const vecLit = toVectorLiteral(vector);
      await prisma.$executeRaw`
        INSERT INTO "KnowledgeChunk"
          ("id", "docId", "workspaceId", "orgId", "chunkIndex", "content", "embedding", "tokenCount", "createdAt")
        VALUES (
          ${id},
          ${docId},
          ${doc.workspaceId},
          ${doc.orgId},
          ${i},
          ${content},
          ${vecLit}::vector,
          ${estimateTokens(content)},
          NOW()
        )
      `;
    }

    // Persist extracted text + mark READY.
    await prisma.knowledgeDoc.update({
      where: { id: docId },
      data: { status: "READY", extractedText: text.slice(0, 500000) },
    });

    return { chunks: chunks.length, chars: text.length };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.knowledgeDoc.update({
      where: { id: docId },
      data: { status: "FAILED", error: message.slice(0, 1000) },
    });
    throw err;
  }
}

/** Create + process in one call (for CLI/tests; async in the HTTP path). */
export async function ingest(input: IngestInput): Promise<{ docId: string; chunks: number }> {
  const docId = await createDoc(input);
  const { chunks } = await processDoc(docId);
  return { docId, chunks };
}

export interface SearchOptions {
  workspaceId: string;
  orgId?: string | null; // when set, restrict to global docs + this org's docs
  k?: number;
  minScore?: number; // filter hits below this cosine similarity
}

/**
 * Semantic search over chunks. Returns top-k by cosine similarity.
 * cosine_similarity = 1 − cosine_distance, and `<=>` is cosine distance.
 */
export async function search(query: string, opts: SearchOptions): Promise<SearchHit[]> {
  const k = opts.k ?? 6;
  const minScore = opts.minScore ?? 0;
  const qVec = await embedQuery(query);
  const vecLit = toVectorLiteral(qVec);

  // Org filter: include workspace-global chunks (orgId IS NULL) plus the given org.
  const orgFilter = opts.orgId
    ? Prisma.sql`AND (c."orgId" = ${opts.orgId} OR c."orgId" IS NULL)`
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
      orgId: string | null;
    }>
  >`
    SELECT
      c."id"          AS "chunkId",
      c."docId"       AS "docId",
      d."title"       AS "docTitle",
      d."fileName"    AS "fileName",
      c."content"     AS "content",
      c."chunkIndex"  AS "chunkIndex",
      c."orgId"       AS "orgId",
      (c."embedding" <=> ${vecLit}::vector) AS "distance"
    FROM "KnowledgeChunk" c
    JOIN "KnowledgeDoc" d ON d."id" = c."docId"
    WHERE c."workspaceId" = ${opts.workspaceId}
      AND c."embedding" IS NOT NULL
      AND d."status" = 'READY'
      ${orgFilter}
    ORDER BY c."embedding" <=> ${vecLit}::vector
    LIMIT ${k}
  `;

  return rows
    .map((r) => ({
      chunkId: r.chunkId,
      docId: r.docId,
      docTitle: r.docTitle,
      fileName: r.fileName,
      content: r.content,
      score: 1 - Number(r.distance),
      chunkIndex: r.chunkIndex,
      orgId: r.orgId,
    }))
    .filter((h) => h.score >= minScore);
}

/**
 * Retrieve concatenated context passages for grounding LLM generation.
 * Returns a formatted string plus the raw hits (for citations).
 */
export async function retrieveContext(
  workspaceId: string,
  query: string,
  opts: { orgId?: string | null; k?: number } = {}
): Promise<{ text: string; hits: SearchHit[] }> {
  const hits = await search(query, {
    workspaceId,
    orgId: opts.orgId,
    k: opts.k ?? 6,
    minScore: 0.15,
  });
  if (hits.length === 0) return { text: "", hits: [] };

  const text = hits
    .map((h, i) => `[KB ${i + 1}] (${h.docTitle}) ${h.content}`)
    .join("\n\n");
  return { text, hits };
}

export async function listDocs(workspaceId: string, orgId?: string | null) {
  return prisma.knowledgeDoc.findMany({
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
      error: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { chunks: true } },
    },
  });
}

export async function deleteDoc(workspaceId: string, docId: string): Promise<boolean> {
  const doc = await prisma.knowledgeDoc.findFirst({
    where: { id: docId, workspaceId },
    select: { id: true },
  });
  if (!doc) return false;
  // chunks cascade via FK
  await prisma.knowledgeDoc.delete({ where: { id: docId } });
  return true;
}
