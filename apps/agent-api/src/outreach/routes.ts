/**
 * Outreach HTTP routes (mounted under /api/outreach).
 * Draft + track + follow-up. NO live sending.
 *
 *   POST   /api/outreach/sequences            create sequence
 *   GET    /api/outreach/sequences            list (?workspaceId=&orgId=)
 *   GET    /api/outreach/sequences/:id        full sequence (contacts + messages)
 *   PATCH  /api/outreach/sequences/:id        update status
 *   POST   /api/outreach/contacts             upsert contact
 *   PATCH  /api/outreach/contacts/:id         update contact status
 *   POST   /api/outreach/messages/generate    draft a message for contact+step
 *   PATCH  /api/outreach/messages/:id         edit/transition a message
 */
import { Router, type Router as RouterType } from "express";
import {
  createSequence,
  listSequences,
  getSequence,
  updateSequenceStatus,
  upsertContact,
  updateContactStatus,
  generateMessage,
  updateMessage,
  type SequenceStep,
} from "./service.js";

export const outreachRouter: RouterType = Router();

outreachRouter.post("/sequences", async (req, res) => {
  try {
    const { workspaceId, name, orgId, goal, steps, seedFromOrgContacts } = req.body as {
      workspaceId?: string;
      name?: string;
      orgId?: string;
      goal?: string;
      steps?: SequenceStep[];
      seedFromOrgContacts?: boolean;
    };
    if (!workspaceId || !name) {
      res.status(400).json({ error: "workspaceId and name are required" });
      return;
    }
    const seq = await createSequence({
      workspaceId,
      name,
      orgId: orgId || null,
      goal: goal || null,
      steps,
      seedFromOrgContacts: seedFromOrgContacts ?? true,
    });
    res.status(201).json(seq);
  } catch (err) {
    console.error("[outreach] create sequence error:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

outreachRouter.get("/sequences", async (req, res) => {
  try {
    const workspaceId = req.query.workspaceId as string;
    const orgId = (req.query.orgId as string) || undefined;
    if (!workspaceId) {
      res.status(400).json({ error: "workspaceId query param required" });
      return;
    }
    const sequences = await listSequences(workspaceId, orgId);
    res.json({ sequences });
  } catch (err) {
    console.error("[outreach] list error:", err);
    res.status(500).json({ error: "Failed to list sequences" });
  }
});

outreachRouter.get("/sequences/:id", async (req, res) => {
  try {
    const seq = await getSequence(req.params.id);
    if (!seq) {
      res.status(404).json({ error: "Sequence not found" });
      return;
    }
    res.json(seq);
  } catch (err) {
    console.error("[outreach] get error:", err);
    res.status(500).json({ error: "Failed to fetch sequence" });
  }
});

outreachRouter.patch("/sequences/:id", async (req, res) => {
  try {
    const { status } = req.body as { status?: "ACTIVE" | "PAUSED" | "COMPLETED" };
    if (!status) {
      res.status(400).json({ error: "status required" });
      return;
    }
    const seq = await updateSequenceStatus(req.params.id, status);
    res.json(seq);
  } catch (err) {
    res.status(500).json({ error: "Failed to update sequence" });
  }
});

outreachRouter.post("/contacts", async (req, res) => {
  try {
    const { workspaceId, sequenceId, name, title, email, channel, orgContactId, id } =
      req.body as Record<string, string>;
    if (!workspaceId || !sequenceId || !name) {
      res.status(400).json({ error: "workspaceId, sequenceId, name required" });
      return;
    }
    const contact = await upsertContact({
      workspaceId,
      sequenceId,
      name,
      title: title || null,
      email: email || null,
      channel: (channel as "EMAIL" | "LINKEDIN" | "PHONE") || "EMAIL",
      orgContactId: orgContactId || null,
      id: id || undefined,
    });
    res.status(id ? 200 : 201).json(contact);
  } catch (err) {
    console.error("[outreach] upsert contact error:", err);
    res.status(500).json({ error: "Failed to upsert contact" });
  }
});

outreachRouter.patch("/contacts/:id", async (req, res) => {
  try {
    const { status } = req.body as { status?: string };
    if (!status) {
      res.status(400).json({ error: "status required" });
      return;
    }
    const contact = await updateContactStatus(
      req.params.id,
      status as "NOT_STARTED" | "DRAFTED" | "SENT" | "OPENED" | "REPLIED" | "BOUNCED" | "DECLINED"
    );
    res.json(contact);
  } catch (err) {
    res.status(500).json({ error: "Failed to update contact" });
  }
});

outreachRouter.post("/messages/generate", async (req, res) => {
  try {
    const { sequenceId, contactId, step, senderName, senderOrg, extraContext } = req.body as {
      sequenceId?: string;
      contactId?: string;
      step?: number;
      senderName?: string;
      senderOrg?: string;
      extraContext?: string;
    };
    if (!sequenceId || !contactId) {
      res.status(400).json({ error: "sequenceId and contactId required" });
      return;
    }
    const msg = await generateMessage({
      sequenceId,
      contactId,
      step: step ?? 0,
      senderName,
      senderOrg,
      extraContext,
    });
    res.json(msg);
  } catch (err) {
    console.error("[outreach] generate error:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Generation failed" });
  }
});

outreachRouter.patch("/messages/:id", async (req, res) => {
  try {
    const { subject, body, status, scheduledFor } = req.body as {
      subject?: string;
      body?: string;
      status?: "DRAFTED" | "SCHEDULED" | "SENT" | "REPLIED" | "BOUNCED";
      scheduledFor?: string | null;
    };
    const msg = await updateMessage({
      messageId: req.params.id,
      subject,
      body,
      status,
      scheduledFor,
    });
    res.json(msg);
  } catch (err) {
    console.error("[outreach] update message error:", err);
    res.status(500).json({ error: "Failed to update message" });
  }
});
