import { z } from "zod";
import { prisma } from "@zeta/db";
import type { MCPToolDefinition } from "../registry.js";
import { retrieveContext, llmCall } from "../lib/kb-retrieve.js";

interface SequenceStep {
  step: number;
  dayOffset: number;
  channel: "EMAIL" | "LINKEDIN" | "PHONE";
  purpose: string;
}

const DEFAULT_STEPS: SequenceStep[] = [
  { step: 0, dayOffset: 0, channel: "EMAIL", purpose: "Warm introduction and partnership premise" },
  { step: 1, dayOffset: 7, channel: "EMAIL", purpose: "Value-add follow-up with a specific hook" },
  { step: 2, dayOffset: 14, channel: "EMAIL", purpose: "Brief final nudge with a clear ask" },
];

export const outreachTools: MCPToolDefinition[] = [
  {
    name: "outreach_sequence_create",
    description:
      "Create an outreach sequence (multi-touch campaign) targeting an org. Optionally seeds contacts from the org's existing contacts. Steps default to a 3-touch email cadence (day 0, 7, 14). No emails are sent — this drafts and tracks only.",
    inputSchema: z.object({
      workspaceId: z.string(),
      name: z.string().min(2),
      orgId: z.string().optional(),
      goal: z.string().optional(),
      seedFromOrgContacts: z.boolean().default(true).optional(),
    }),
    handler: async (input) => {
      const { workspaceId, name, orgId, goal, seedFromOrgContacts = true } = input as {
        workspaceId: string;
        name: string;
        orgId?: string;
        goal?: string;
        seedFromOrgContacts?: boolean;
      };

      const sequence = await prisma.outreachSequence.create({
        data: {
          workspaceId,
          orgId: orgId ?? null,
          name,
          goal: goal ?? null,
          steps: DEFAULT_STEPS as unknown as object,
          status: "ACTIVE",
        },
      });

      let seeded = 0;
      if (seedFromOrgContacts && orgId) {
        const orgContacts = await prisma.orgContact.findMany({
          where: { orgId },
          orderBy: [{ isPrimary: "desc" }, { role: "asc" }],
        });
        for (const oc of orgContacts) {
          await prisma.outreachContact.create({
            data: {
              workspaceId,
              sequenceId: sequence.id,
              orgContactId: oc.id,
              name: oc.name,
              title: oc.title ?? null,
              email: oc.email ?? null,
              channel: "EMAIL",
              status: "NOT_STARTED",
            },
          });
          seeded++;
        }
      }

      return { sequenceId: sequence.id, name: sequence.name, seededContacts: seeded };
    },
  },
  {
    name: "outreach_sequence_list",
    description: "List outreach sequences for a workspace (optionally scoped to an org), with contact and message counts.",
    inputSchema: z.object({
      workspaceId: z.string(),
      orgId: z.string().optional(),
    }),
    handler: async (input) => {
      const { workspaceId, orgId } = input as { workspaceId: string; orgId?: string };
      const sequences = await prisma.outreachSequence.findMany({
        where: { workspaceId, ...(orgId ? { orgId } : {}) },
        orderBy: { createdAt: "desc" },
        include: {
          org: { select: { id: true, name: true, slug: true } },
          _count: { select: { contacts: true, messages: true } },
        },
      });
      return { sequences, total: sequences.length };
    },
  },
  {
    name: "outreach_sequence_get",
    description: "Get a full outreach sequence including all contacts and their drafted messages (grouped by step).",
    inputSchema: z.object({ sequenceId: z.string() }),
    handler: async (input) => {
      const { sequenceId } = input as { sequenceId: string };
      const sequence = await prisma.outreachSequence.findUnique({
        where: { id: sequenceId },
        include: {
          org: { select: { id: true, name: true, slug: true } },
          contacts: {
            orderBy: { createdAt: "asc" },
            include: { messages: { orderBy: { step: "asc" } } },
          },
        },
      });
      if (!sequence) throw new Error("Sequence not found");
      return sequence;
    },
  },
  {
    name: "outreach_contact_upsert",
    description: "Add or update a contact in an outreach sequence.",
    inputSchema: z.object({
      workspaceId: z.string(),
      sequenceId: z.string(),
      name: z.string().min(1),
      title: z.string().optional(),
      email: z.string().optional(),
      channel: z.enum(["EMAIL", "LINKEDIN", "PHONE"]).default("EMAIL").optional(),
      orgContactId: z.string().optional(),
      id: z.string().optional(),
    }),
    handler: async (input) => {
      const { id, workspaceId, sequenceId, name, title, email, channel, orgContactId } =
        input as {
          id?: string;
          workspaceId: string;
          sequenceId: string;
          name: string;
          title?: string;
          email?: string;
          channel?: "EMAIL" | "LINKEDIN" | "PHONE";
          orgContactId?: string;
        };
      if (id) {
        return prisma.outreachContact.update({
          where: { id },
          data: { name, title: title ?? null, email: email ?? null, channel: channel ?? "EMAIL" },
        });
      }
      return prisma.outreachContact.create({
        data: {
          workspaceId,
          sequenceId,
          orgContactId: orgContactId ?? null,
          name,
          title: title ?? null,
          email: email ?? null,
          channel: channel ?? "EMAIL",
          status: "NOT_STARTED",
        },
      });
    },
  },
  {
    name: "outreach_message_generate",
    description:
      "Draft a personalized outreach message for a contact at a given step (0 = first touch, 1+ = follow-ups). Grounds the draft in knowledge-base passages relevant to the org and goal. Persists the draft (status DRAFTED/SCHEDULED), sets scheduledFor from the step's day offset, and returns the subject + body. Does NOT send email.",
    inputSchema: z.object({
      sequenceId: z.string(),
      contactId: z.string(),
      step: z.number().int().min(0).max(10).default(0).optional(),
      senderName: z.string().optional(),
      senderOrg: z.string().optional(),
      extraContext: z.string().optional(),
    }),
    handler: async (input) => {
      const { sequenceId, contactId, step = 0, senderName, senderOrg, extraContext } = input as {
        sequenceId: string;
        contactId: string;
        step?: number;
        senderName?: string;
        senderOrg?: string;
        extraContext?: string;
      };

      const sequence = await prisma.outreachSequence.findUnique({
        where: { id: sequenceId },
        include: { org: true },
      });
      if (!sequence) throw new Error("Sequence not found");
      const contact = await prisma.outreachContact.findUnique({ where: { id: contactId } });
      if (!contact) throw new Error("Contact not found");

      const steps = (sequence.steps as unknown as SequenceStep[]) ?? DEFAULT_STEPS;
      const fallback = DEFAULT_STEPS[Math.min(step, DEFAULT_STEPS.length - 1)] ?? DEFAULT_STEPS[0]!;
      const stepConfig: SequenceStep = steps.find((s) => s.step === step) ?? fallback;

      const org = sequence.org;
      const query = `${sequence.goal ?? ""} ${org?.name ?? ""} ${stepConfig.purpose}`.trim();
      const { text: kbText, hits } = await retrieveContext(sequence.workspaceId, query, {
        orgId: sequence.orgId,
        k: 5,
      });

      const orgBlurb = org
        ? [
            `Target organization: ${org.name}${org.externalId ? ` (${org.externalId})` : ""}`,
            org.country ? `Country: ${org.country}` : "",
            org.cancerTypes?.length ? `Cancer focus: ${org.cancerTypes.join(", ")}` : "",
            org.mission || org.description ? `Mission: ${org.mission || org.description}` : "",
          ]
            .filter(Boolean)
            .join("\n")
        : "";

      const isFollowUp = step > 0;
      const systemPrompt =
        `You are an expert nonprofit partnerships writer drafting a ${isFollowUp ? "follow-up" : "first-touch"} outreach ${stepConfig.channel === "EMAIL" ? "email" : "message"} on behalf of ${senderOrg || "CrisPRO"}. ` +
        `Write warm, specific, and concise copy (under 220 words). Address the recipient by name. Reference concrete details about their organization and priorities. Avoid generic filler and hype. ` +
        `${isFollowUp ? "This is a follow-up, so keep it brief, add one new specific value hook, and do not repeat the full pitch." : ""} ` +
        `Return the result as a "Subject:" line (for email) followed by a blank line and the message body. No commentary.`;

      const userPrompt = [
        `RECIPIENT: ${contact.name}${contact.title ? `, ${contact.title}` : ""}`,
        orgBlurb,
        sequence.goal ? `OUTREACH GOAL: ${sequence.goal}` : "",
        `STEP PURPOSE: ${stepConfig.purpose}`,
        kbText ? `\nGROUNDING CONTEXT FROM KNOWLEDGE BASE (cite specifics, do not quote verbatim):\n${kbText}` : "",
        extraContext ? `\nADDITIONAL CONTEXT:\n${extraContext}` : "",
        `\nSender: ${senderName || "the CrisPRO team"} (${senderOrg || "CrisPRO"}).`,
        `\nWrite the ${isFollowUp ? "follow-up " : ""}message now.`,
      ]
        .filter(Boolean)
        .join("\n");

      const raw = await llmCall(systemPrompt, userPrompt, 900);

      let subject: string | null = null;
      let body = raw.trim();
      const m = body.match(/^\s*subject\s*:\s*(.+?)\s*\n/i);
      if (m && m[1]) {
        subject = m[1].trim();
        body = body.slice(m[0].length).trim();
      }

      const scheduledFor =
        stepConfig.dayOffset > 0
          ? new Date(Date.now() + stepConfig.dayOffset * 24 * 60 * 60 * 1000)
          : null;

      const existing = await prisma.outreachMessage.findFirst({
        where: { sequenceId, contactId, step },
      });
      const saved = existing
        ? await prisma.outreachMessage.update({
            where: { id: existing.id },
            data: { subject, body, scheduledFor, status: "DRAFTED" },
          })
        : await prisma.outreachMessage.create({
            data: {
              sequenceId,
              contactId,
              step,
              subject,
              body,
              scheduledFor,
              status: stepConfig.dayOffset > 0 ? "SCHEDULED" : "DRAFTED",
            },
          });

      if (contact.status === "NOT_STARTED") {
        await prisma.outreachContact.update({ where: { id: contact.id }, data: { status: "DRAFTED" } });
      }

      return {
        messageId: saved.id,
        subject: saved.subject,
        body: saved.body,
        step,
        scheduledFor: saved.scheduledFor,
        kbCitations: hits.length,
      };
    },
  },
  {
    name: "outreach_message_update",
    description:
      "Update an outreach message: edit subject/body, or transition status (DRAFTED, SCHEDULED, SENT, REPLIED, BOUNCED). Marking SENT stamps sentAt and mirrors the status onto the contact. This only records status — it does not actually send email.",
    inputSchema: z.object({
      messageId: z.string(),
      subject: z.string().optional(),
      body: z.string().optional(),
      status: z.enum(["DRAFTED", "SCHEDULED", "SENT", "REPLIED", "BOUNCED"]).optional(),
      scheduledFor: z.string().nullable().optional(),
    }),
    handler: async (input) => {
      const { messageId, subject, body, status, scheduledFor } = input as {
        messageId: string;
        subject?: string;
        body?: string;
        status?: "DRAFTED" | "SCHEDULED" | "SENT" | "REPLIED" | "BOUNCED";
        scheduledFor?: string | null;
      };
      const data: Record<string, unknown> = {};
      if (subject !== undefined) data["subject"] = subject;
      if (body !== undefined) data["body"] = body;
      if (status !== undefined) {
        data["status"] = status;
        if (status === "SENT") data["sentAt"] = new Date();
      }
      if (scheduledFor !== undefined) {
        data["scheduledFor"] = scheduledFor ? new Date(scheduledFor) : null;
      }
      const msg = await prisma.outreachMessage.update({ where: { id: messageId }, data });

      if (status === "SENT" || status === "REPLIED" || status === "BOUNCED") {
        const contactStatus = status === "SENT" ? "SENT" : status === "REPLIED" ? "REPLIED" : "BOUNCED";
        await prisma.outreachContact.update({
          where: { id: msg.contactId },
          data: { status: contactStatus },
        });
      }
      return msg;
    },
  },
];
