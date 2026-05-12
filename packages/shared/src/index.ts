import { z } from "zod";

// ─── Slug utilities ───────────────────────────────────────────────────────────

export function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
}

export function generateSlug(name: string, suffix?: string): string {
  const base = toSlug(name);
  return suffix ? `${base}-${suffix}` : base;
}

// ─── Workspace Schemas ────────────────────────────────────────────────────────

export const CreateWorkspaceSchema = z.object({
  name: z.string().min(2).max(100),
  slug: z.string().min(2).max(50).regex(/^[a-z0-9-]+$/),
  description: z.string().max(500).optional(),
});

// ─── AdvocacyOrg Schemas ──────────────────────────────────────────────────────

export const CreateOrgSchema = z.object({
  workspaceId: z.string().cuid(),
  name: z.string().min(2).max(200),
  slug: z.string().min(2).max(100).regex(/^[a-z0-9-]+$/).optional(),
  description: z.string().max(2000).optional(),
  mission: z.string().max(1000).optional(),
  website: z.string().url().optional(),
  cancerTypes: z.array(z.string()).default([]),
  orgType: z.enum(["NONPROFIT", "FOUNDATION", "PATIENT_GROUP", "RESEARCH_INSTITUTE", "GOVERNMENT", "INDUSTRY", "COALITION"]).default("NONPROFIT"),
  headquarters: z.string().optional(),
  foundedYear: z.number().int().min(1800).max(2030).optional(),
});

export const UpdateOrgSchema = CreateOrgSchema.partial().omit({ workspaceId: true });

// ─── Campaign Schemas ─────────────────────────────────────────────────────────

export const CreateCampaignSchema = z.object({
  orgId: z.string().cuid(),
  name: z.string().min(2).max(200),
  slug: z.string().min(2).max(100).regex(/^[a-z0-9-]+$/).optional(),
  description: z.string().max(2000).optional(),
  objective: z.string().max(1000).optional(),
  cancerTypes: z.array(z.string()).default([]),
  targetAudience: z.array(z.string()).default([]),
  status: z.enum(["PLANNING", "ACTIVE", "PAUSED", "COMPLETED", "ARCHIVED"]).default("PLANNING"),
  priority: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]).default("MEDIUM"),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  budget: z.number().positive().optional(),
  tags: z.array(z.string()).default([]),
});

export const UpdateCampaignSchema = CreateCampaignSchema.partial().omit({ orgId: true });

// ─── Initiative Schemas ───────────────────────────────────────────────────────

export const CreateInitiativeSchema = z.object({
  campaignId: z.string().cuid(),
  name: z.string().min(2).max(200),
  slug: z.string().min(2).max(100).regex(/^[a-z0-9-]+$/).optional(),
  description: z.string().max(2000).optional(),
  type: z.enum(["POLICY_ADVOCACY", "RESEARCH_FUNDING", "PATIENT_SUPPORT", "AWARENESS", "COALITION_BUILDING", "REGULATORY_ENGAGEMENT", "CLINICAL_TRIAL_ACCESS", "BIOMARKER_ADVOCACY", "MEDIA_CAMPAIGN", "GENERAL"]).default("GENERAL"),
  status: z.enum(["BACKLOG", "PLANNING", "IN_PROGRESS", "REVIEW", "BLOCKED", "COMPLETED", "CANCELLED"]).default("BACKLOG"),
  priority: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]).default("MEDIUM"),
  startDate: z.string().datetime().optional(),
  dueDate: z.string().datetime().optional(),
  successCriteria: z.string().max(1000).optional(),
});

export const UpdateInitiativeSchema = CreateInitiativeSchema.partial().omit({ campaignId: true });

// ─── Task Schemas ─────────────────────────────────────────────────────────────

export const CreateTaskSchema = z.object({
  initiativeId: z.string().cuid(),
  parentTaskId: z.string().cuid().optional(),
  title: z.string().min(2).max(500),
  description: z.string().max(5000).optional(),
  type: z.enum(["ACTION", "RESEARCH", "MEETING", "DOCUMENT", "OUTREACH", "REVIEW", "APPROVAL", "MILESTONE"]).default("ACTION"),
  status: z.enum(["TODO", "IN_PROGRESS", "IN_REVIEW", "BLOCKED", "DONE", "CANCELLED"]).default("TODO"),
  priority: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]).default("MEDIUM"),
  assigneeId: z.string().cuid().optional(),
  dueDate: z.string().datetime().optional(),
  estimatedHours: z.number().positive().optional(),
  storyPoints: z.number().int().min(1).max(100).optional(),
  labels: z.array(z.string()).default([]),
});

export const UpdateTaskSchema = CreateTaskSchema.partial().omit({ initiativeId: true });

// ─── Evidence Schemas ─────────────────────────────────────────────────────────

export const CreateEvidenceSchema = z.object({
  initiativeId: z.string().cuid().optional(),
  taskId: z.string().cuid().optional(),
  title: z.string().min(2).max(500),
  summary: z.string().max(2000).optional(),
  content: z.string().optional(),
  evidenceType: z.enum(["PUBLICATION", "CLINICAL_TRIAL", "FDA_GUIDANCE", "CONGRESSIONAL_RECORD", "PRESS_RELEASE", "PATIENT_TESTIMONY", "EXPERT_OPINION", "SYSTEMATIC_REVIEW", "META_ANALYSIS", "REAL_WORLD_DATA", "BIOMARKER_DATA", "POLICY_BRIEF"]).default("PUBLICATION"),
  source: z.string().max(200).optional(),
  sourceUrl: z.string().url().optional(),
  doi: z.string().optional(),
  pmid: z.string().optional(),
  publishedAt: z.string().datetime().optional(),
  authors: z.array(z.string()).default([]),
  cancerTypes: z.array(z.string()).default([]),
  biomarkers: z.array(z.string()).default([]),
  strength: z.enum(["STRONG", "MODERATE", "WEAK", "ANECDOTAL"]).default("MODERATE"),
  tags: z.array(z.string()).default([]),
});

// ─── Clinical Trial Schemas ───────────────────────────────────────────────────

export const CreateTrialSchema = z.object({
  nctId: z.string().regex(/^NCT\d{8}$/),
  title: z.string().min(2).max(500),
  phase: z.enum(["PHASE_1", "PHASE_1_2", "PHASE_2", "PHASE_2_3", "PHASE_3", "PHASE_4", "NOT_APPLICABLE"]).optional(),
  status: z.enum(["NOT_YET_RECRUITING", "RECRUITING", "ACTIVE_NOT_RECRUITING", "COMPLETED", "TERMINATED", "WITHDRAWN", "SUSPENDED", "UNKNOWN"]).default("UNKNOWN"),
  sponsor: z.string().optional(),
  conditions: z.array(z.string()).default([]),
  interventions: z.array(z.string()).default([]),
  biomarkers: z.array(z.string()).default([]),
  primaryEndpoint: z.string().optional(),
  enrollment: z.number().int().positive().optional(),
  startDate: z.string().datetime().optional(),
  completionDate: z.string().datetime().optional(),
  summary: z.string().optional(),
  advocacyNotes: z.string().optional(),
});

// ─── Biomarker Schemas ────────────────────────────────────────────────────────

export const CreateBiomarkerSchema = z.object({
  symbol: z.string().min(1).max(50).toUpperCase(),
  name: z.string().min(2).max(200),
  aliases: z.array(z.string()).default([]),
  geneId: z.string().optional(),
  cancerTypes: z.array(z.string()).default([]),
  biomarkerType: z.enum(["GENETIC", "PROTEIN_EXPRESSION", "EPIGENETIC", "METABOLIC", "IMAGING", "LIQUID_BIOPSY"]).default("GENETIC"),
  clinicalSignificance: z.string().optional(),
  fdaApproved: z.boolean().default(false),
  fdaApprovedDrugs: z.array(z.string()).default([]),
  companionDx: z.array(z.string()).default([]),
  advocacyPriority: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]).default("MEDIUM"),
});

// ─── Patient Story Schemas ────────────────────────────────────────────────────

export const CreatePatientStorySchema = z.object({
  orgId: z.string().cuid(),
  title: z.string().min(2).max(200),
  slug: z.string().min(2).max(100).regex(/^[a-z0-9-]+$/).optional(),
  content: z.string().min(10),
  summary: z.string().max(500).optional(),
  cancerType: z.string().min(2),
  diagnosisYear: z.number().int().min(1900).max(2030).optional(),
  stage: z.string().optional(),
  biomarkers: z.array(z.string()).default([]),
  treatmentPath: z.string().optional(),
  outcome: z.enum(["ONGOING", "REMISSION", "SURVIVOR", "DECEASED", "UNKNOWN"]).default("ONGOING"),
  isAnonymized: z.boolean().default(false),
  consentGiven: z.boolean().default(false),
  advocacyThemes: z.array(z.string()).default([]),
});

// ─── Agent Run Schemas ────────────────────────────────────────────────────────

export const StartAgentRunSchema = z.object({
  workspaceId: z.string().cuid(),
  role: z.enum(["ADVOCACY_PM", "RESEARCH_INTELLIGENCE", "COALITION_BUILDER", "STANDUP_REPORTER"]),
  message: z.string().min(1).max(10000),
  context: z.object({
    orgId: z.string().cuid().optional(),
    campaignId: z.string().cuid().optional(),
    initiativeId: z.string().cuid().optional(),
    taskId: z.string().cuid().optional(),
  }).optional(),
});

export const ApproveAgentRunSchema = z.object({
  approved: z.boolean(),
  feedback: z.string().optional(),
});

// ─── Search Schema ────────────────────────────────────────────────────────────

export const SearchSchema = z.object({
  workspaceId: z.string().cuid(),
  query: z.string().min(1).max(500),
  types: z.array(z.string()).optional(),
  limit: z.number().int().min(1).max(50).default(10),
});

export type CreateWorkspaceInput = z.infer<typeof CreateWorkspaceSchema>;
export type CreateOrgInput = z.infer<typeof CreateOrgSchema>;
export type UpdateOrgInput = z.infer<typeof UpdateOrgSchema>;
export type CreateCampaignInput = z.infer<typeof CreateCampaignSchema>;
export type UpdateCampaignInput = z.infer<typeof UpdateCampaignSchema>;
export type CreateInitiativeInput = z.infer<typeof CreateInitiativeSchema>;
export type UpdateInitiativeInput = z.infer<typeof UpdateInitiativeSchema>;
export type CreateTaskInput = z.infer<typeof CreateTaskSchema>;
export type UpdateTaskInput = z.infer<typeof UpdateTaskSchema>;
export type CreateEvidenceInput = z.infer<typeof CreateEvidenceSchema>;
export type CreateTrialInput = z.infer<typeof CreateTrialSchema>;
export type CreateBiomarkerInput = z.infer<typeof CreateBiomarkerSchema>;
export type CreatePatientStoryInput = z.infer<typeof CreatePatientStorySchema>;
export type StartAgentRunInput = z.infer<typeof StartAgentRunSchema>;
export type ApproveAgentRunInput = z.infer<typeof ApproveAgentRunSchema>;
export type SearchInput = z.infer<typeof SearchSchema>;
