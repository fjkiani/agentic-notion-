/**
 * Outreach service: sequences, contacts, and message generation.
 * Draft + track + follow-up only — NO live email sending.
 *
 * Message generation reuses the OpenRouter LLM chain and grounds the draft
 * with knowledge-base passages via retrieveContext().
 */
import { prisma } from "@zeta/db";
import { llmCall, OUTREACH_MODEL } from "../kb/llm.js";
import { retrieveContext } from "../kb/service.js";

type Channel = "EMAIL" | "LINKEDIN" | "PHONE";

export interface SequenceStep {
  step: number;
  dayOffset: number; // days from sequence start
  channel: Channel;
  purpose: string; // e.g. "intro", "nudge", "value-add", "final follow-up"
}

/** Default 3-touch cadence used when a sequence is created without explicit steps. */
export const DEFAULT_STEPS: SequenceStep[] = [
  { step: 0, dayOffset: 0, channel: "EMAIL", purpose: "Warm introduction and partnership premise" },
  { step: 1, dayOffset: 7, channel: "EMAIL", purpose: "Value-add follow-up with a specific hook" },
  { step: 2, dayOffset: 14, channel: "EMAIL", purpose: "Brief final nudge with a clear ask" },
];

// ─── Sequences ────────────────────────────────────────────────────────────────

export async function createSequence(input: {
  workspaceId: string;
  name: string;
  orgId?: string | null;
  goal?: string | null;
  steps?: SequenceStep[];
  seedFromOrgContacts?: boolean;
}) {
  const steps = input.steps && input.steps.length ? input.steps : DEFAULT_STEPS;

  const sequence = await prisma.outreachSequence.create({
    data: {
      workspaceId: input.workspaceId,
      orgId: input.orgId ?? null,
      name: input.name,
      goal: input.goal ?? null,
      steps: steps as unknown as object,
      status: "ACTIVE",
    },
  });

  // Optionally seed contacts from the org's existing OrgContacts.
  if (input.seedFromOrgContacts && input.orgId) {
    const orgContacts = await prisma.orgContact.findMany({
      where: { orgId: input.orgId },
      orderBy: [{ isPrimary: "desc" }, { role: "asc" }],
    });
    for (const oc of orgContacts) {
      await prisma.outreachContact.create({
        data: {
          workspaceId: input.workspaceId,
          sequenceId: sequence.id,
          orgContactId: oc.id,
          name: oc.name,
          title: oc.title ?? null,
          email: oc.email ?? null,
          channel: "EMAIL",
          status: "NOT_STARTED",
        },
      });
    }
  }

  return getSequence(sequence.id);
}

export async function listSequences(workspaceId: string, orgId?: string | null) {
  return prisma.outreachSequence.findMany({
    where: { workspaceId, ...(orgId ? { orgId } : {}) },
    orderBy: { createdAt: "desc" },
    include: {
      org: { select: { id: true, name: true, slug: true, externalId: true } },
      _count: { select: { contacts: true, messages: true } },
    },
  });
}

export async function getSequence(sequenceId: string) {
  return prisma.outreachSequence.findUnique({
    where: { id: sequenceId },
    include: {
      org: { select: { id: true, name: true, slug: true, externalId: true } },
      contacts: {
        orderBy: { createdAt: "asc" },
        include: {
          messages: { orderBy: { step: "asc" } },
        },
      },
    },
  });
}

export async function updateSequenceStatus(
  sequenceId: string,
  status: "ACTIVE" | "PAUSED" | "COMPLETED"
) {
  return prisma.outreachSequence.update({ where: { id: sequenceId }, data: { status } });
}

// ─── Contacts ─────────────────────────────────────────────────────────────────

export async function upsertContact(input: {
  workspaceId: string;
  sequenceId: string;
  name: string;
  title?: string | null;
  email?: string | null;
  channel?: Channel;
  orgContactId?: string | null;
  id?: string;
}) {
  if (input.id) {
    return prisma.outreachContact.update({
      where: { id: input.id },
      data: {
        name: input.name,
        title: input.title ?? null,
        email: input.email ?? null,
        channel: input.channel ?? "EMAIL",
      },
    });
  }
  return prisma.outreachContact.create({
    data: {
      workspaceId: input.workspaceId,
      sequenceId: input.sequenceId,
      orgContactId: input.orgContactId ?? null,
      name: input.name,
      title: input.title ?? null,
      email: input.email ?? null,
      channel: input.channel ?? "EMAIL",
      status: "NOT_STARTED",
    },
  });
}

export async function updateContactStatus(
  contactId: string,
  status: "NOT_STARTED" | "DRAFTED" | "SENT" | "OPENED" | "REPLIED" | "BOUNCED" | "DECLINED"
) {
  return prisma.outreachContact.update({ where: { id: contactId }, data: { status } });
}

// ─── Message generation ─────────────────────────────────────────────────────

function buildOrgBlurb(org: {
  name: string;
  externalId?: string | null;
  country?: string | null;
  mission?: string | null;
  description?: string | null;
  cancerTypes?: string[];
} | null): string {
  if (!org) return "";
  return [
    `Target organization: ${org.name}${org.externalId ? ` (${org.externalId})` : ""}`,
    org.country ? `Country: ${org.country}` : "",
    org.cancerTypes?.length ? `Cancer focus: ${org.cancerTypes.join(", ")}` : "",
    org.mission || org.description ? `Mission: ${org.mission || org.description}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Generate (draft) an outreach message for a contact + step.
 * Persists an OutreachMessage row (status DRAFTED), sets scheduledFor from the
 * step's dayOffset, and flips the contact to DRAFTED. Does NOT send anything.
 */
export async function generateMessage(input: {
  sequenceId: string;
  contactId: string;
  step?: number;
  senderName?: string;
  senderOrg?: string;
  extraContext?: string;
}): Promise<{
  id: string;
  subject: string | null;
  body: string;
  step: number;
  scheduledFor: Date | null;
  kbCitations: number;
}> {
  const sequence = await prisma.outreachSequence.findUnique({
    where: { id: input.sequenceId },
    include: { org: true },
  });
  if (!sequence) throw new Error("Sequence not found");

  const contact = await prisma.outreachContact.findUnique({ where: { id: input.contactId } });
  if (!contact) throw new Error("Contact not found");

  const steps = (sequence.steps as unknown as SequenceStep[]) ?? DEFAULT_STEPS;
  const step = input.step ?? 0;
  const fallbackStep: SequenceStep =
    DEFAULT_STEPS[Math.min(step, DEFAULT_STEPS.length - 1)] ?? DEFAULT_STEPS[0]!;
  const stepConfig: SequenceStep = steps.find((s) => s.step === step) ?? fallbackStep;

  // Ground with KB passages relevant to the org + goal.
  const query = `${sequence.goal ?? ""} ${sequence.org?.name ?? ""} ${stepConfig.purpose}`.trim();
  const { text: kbText, hits } = await retrieveContext(sequence.workspaceId, query, {
    orgId: sequence.orgId,
    k: 5,
  });

  const orgBlurb = buildOrgBlurb(
    sequence.org as unknown as Parameters<typeof buildOrgBlurb>[0]
  );

  const senderName = input.senderName || "the CrisPRO team";
  const senderOrg = input.senderOrg || "CrisPRO";

  const isFollowUp = step > 0;
  const systemPrompt = `You are an expert nonprofit partnerships writer drafting a ${
    isFollowUp ? "follow-up" : "first-touch"
  } outreach ${stepConfig.channel === "EMAIL" ? "email" : "message"} on behalf of ${senderOrg}. ` +
    `Write warm, specific, and concise copy (under 220 words). Address the recipient by name. ` +
    `Reference concrete details about their organization and priorities. Avoid generic filler and hype. ` +
    `${isFollowUp ? "This is a follow-up, so keep it brief, add one new specific value hook, and do not repeat the full pitch." : ""} ` +
    `Return the result as: a "Subject:" line (for email) followed by a blank line and the message body. Do not include any commentary.`;

  const userPrompt = [
    `RECIPIENT: ${contact.name}${contact.title ? `, ${contact.title}` : ""}`,
    orgBlurb,
    sequence.goal ? `OUTREACH GOAL: ${sequence.goal}` : "",
    `STEP PURPOSE: ${stepConfig.purpose}`,
    kbText ? `\nGROUNDING CONTEXT FROM KNOWLEDGE BASE (cite specifics, do not quote verbatim):\n${kbText}` : "",
    input.extraContext ? `\nADDITIONAL CONTEXT:\n${input.extraContext}` : "",
    `\nSender: ${senderName} (${senderOrg}).`,
    `\nWrite the ${isFollowUp ? "follow-up " : ""}${stepConfig.channel === "EMAIL" ? "email" : "message"} now.`,
  ]
    .filter(Boolean)
    .join("\n");

  const raw = await llmCall(systemPrompt, userPrompt, 900, OUTREACH_MODEL);

  // Parse "Subject: ..." line if present.
  let subject: string | null = null;
  let body = raw.trim();
  const subjMatch = body.match(/^\s*subject\s*:\s*(.+?)\s*\n/i);
  if (subjMatch && subjMatch[1]) {
    subject = subjMatch[1].trim();
    body = body.slice(subjMatch[0].length).trim();
  }

  const scheduledFor =
    stepConfig.dayOffset > 0
      ? new Date(Date.now() + stepConfig.dayOffset * 24 * 60 * 60 * 1000)
      : null;

  // Upsert message for this contact+step (regenerate replaces the prior draft).
  const existing = await prisma.outreachMessage.findFirst({
    where: { sequenceId: input.sequenceId, contactId: input.contactId, step },
  });

  const saved = existing
    ? await prisma.outreachMessage.update({
        where: { id: existing.id },
        data: { subject, body, scheduledFor, status: "DRAFTED" },
      })
    : await prisma.outreachMessage.create({
        data: {
          sequenceId: input.sequenceId,
          contactId: input.contactId,
          step,
          subject,
          body,
          scheduledFor,
          status: stepConfig.dayOffset > 0 ? "SCHEDULED" : "DRAFTED",
        },
      });

  // Move contact to DRAFTED if it was untouched.
  if (contact.status === "NOT_STARTED") {
    await prisma.outreachContact.update({
      where: { id: contact.id },
      data: { status: "DRAFTED" },
    });
  }

  return {
    id: saved.id,
    subject: saved.subject,
    body: saved.body,
    step,
    scheduledFor: saved.scheduledFor,
    kbCitations: hits.length,
  };
}

export async function updateMessage(input: {
  messageId: string;
  subject?: string | null;
  body?: string;
  status?: "DRAFTED" | "SCHEDULED" | "SENT" | "REPLIED" | "BOUNCED";
  scheduledFor?: string | null;
}) {
  const data: Record<string, unknown> = {};
  if (input.subject !== undefined) data.subject = input.subject;
  if (input.body !== undefined) data.body = input.body;
  if (input.status !== undefined) {
    data.status = input.status;
    if (input.status === "SENT") data.sentAt = new Date();
  }
  if (input.scheduledFor !== undefined) {
    data.scheduledFor = input.scheduledFor ? new Date(input.scheduledFor) : null;
  }

  const msg = await prisma.outreachMessage.update({ where: { id: input.messageId }, data });

  // Mirror message status onto the contact for board tracking.
  if (input.status === "SENT" || input.status === "REPLIED" || input.status === "BOUNCED") {
    const contactStatus =
      input.status === "SENT" ? "SENT" : input.status === "REPLIED" ? "REPLIED" : "BOUNCED";
    await prisma.outreachContact.update({
      where: { id: msg.contactId },
      data: { status: contactStatus },
    });
  }

  return msg;
}
