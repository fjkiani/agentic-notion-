/**
 * Knowledge base HTTP routes (mounted under /api/kb).
 *   POST   /api/kb/upload      multipart file upload → create doc, async process
 *   GET    /api/kb/docs        list docs (optional ?workspaceId=&orgId=)
 *   GET    /api/kb/docs/:id    single doc status/detail
 *   DELETE /api/kb/docs/:id    delete doc + chunks
 *   POST   /api/kb/search      { workspaceId, query, orgId?, k? } → top-k hits
 *   POST   /api/kb/reprocess/:id  re-run extraction/embedding for a doc
 */
import { Router, type Router as RouterType } from "express";
import multer from "multer";
import {
  createDoc,
  processDoc,
  listDocs,
  deleteDoc,
  search,
} from "./service.js";
import { prisma } from "@zeta/db";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB cap
});

export const kbRouter: RouterType = Router();

// Fire-and-forget processing with logging (kept out of the request lifecycle).
function processInBackground(docId: string) {
  void processDoc(docId)
    .then((r) => console.log(`[KB] processed ${docId}: ${r.chunks} chunks, ${r.chars} chars`))
    .catch((e) => console.error(`[KB] processing failed for ${docId}:`, e?.message || e));
}

kbRouter.post("/upload", upload.single("file"), async (req, res) => {
  try {
    const file = req.file;
    const { workspaceId, orgId, grantId, title, tags } = req.body as Record<string, string>;

    if (!workspaceId) {
      res.status(400).json({ error: "workspaceId is required" });
      return;
    }
    if (!file) {
      res.status(400).json({ error: "file is required (multipart field 'file')" });
      return;
    }

    const docId = await createDoc({
      workspaceId,
      orgId: orgId || null,
      grantId: grantId || null,
      title: title || file.originalname,
      fileName: file.originalname,
      mimeType: file.mimetype || "application/octet-stream",
      buffer: file.buffer,
      tags: tags ? tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
    });

    processInBackground(docId);

    res.status(202).json({
      docId,
      status: "PENDING",
      message: "File received; processing started.",
    });
  } catch (err) {
    console.error("[KB] upload error:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Upload failed" });
  }
});

kbRouter.get("/docs", async (req, res) => {
  try {
    const workspaceId = req.query.workspaceId as string;
    const orgId = (req.query.orgId as string) || undefined;
    if (!workspaceId) {
      res.status(400).json({ error: "workspaceId query param is required" });
      return;
    }
    const docs = await listDocs(workspaceId, orgId);
    res.json({ docs });
  } catch (err) {
    console.error("[KB] list error:", err);
    res.status(500).json({ error: "Failed to list docs" });
  }
});

kbRouter.get("/docs/:id", async (req, res) => {
  try {
    const doc = await prisma.knowledgeDoc.findUnique({
      where: { id: req.params.id },
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
        extractedText: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { chunks: true } },
      },
    });
    if (!doc) {
      res.status(404).json({ error: "Doc not found" });
      return;
    }
    res.json(doc);
  } catch (err) {
    console.error("[KB] get error:", err);
    res.status(500).json({ error: "Failed to fetch doc" });
  }
});

kbRouter.delete("/docs/:id", async (req, res) => {
  try {
    const workspaceId = (req.query.workspaceId as string) || (req.body?.workspaceId as string);
    if (!workspaceId) {
      res.status(400).json({ error: "workspaceId is required" });
      return;
    }
    const ok = await deleteDoc(workspaceId, req.params.id);
    if (!ok) {
      res.status(404).json({ error: "Doc not found" });
      return;
    }
    res.json({ deleted: true });
  } catch (err) {
    console.error("[KB] delete error:", err);
    res.status(500).json({ error: "Failed to delete doc" });
  }
});

kbRouter.post("/reprocess/:id", async (req, res) => {
  try {
    processInBackground(req.params.id);
    res.status(202).json({ docId: req.params.id, status: "PROCESSING" });
  } catch (err) {
    res.status(500).json({ error: "Failed to reprocess" });
  }
});

kbRouter.post("/search", async (req, res) => {
  try {
    const { workspaceId, query, orgId, k } = req.body as {
      workspaceId?: string;
      query?: string;
      orgId?: string;
      k?: number;
    };
    if (!workspaceId || !query) {
      res.status(400).json({ error: "workspaceId and query are required" });
      return;
    }
    const hits = await search(query, { workspaceId, orgId: orgId || null, k: k ?? 6 });
    res.json({ hits });
  } catch (err) {
    console.error("[KB] search error:", err);
    res.status(500).json({ error: "Search failed" });
  }
});
