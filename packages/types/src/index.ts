// ─────────────────────────────────────────────────────────────────────────────
// CAID Shared Types
// ─────────────────────────────────────────────────────────────────────────────

export type Priority = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
export type TaskStatus = "TODO" | "IN_PROGRESS" | "IN_REVIEW" | "BLOCKED" | "DONE" | "CANCELLED";
export type CampaignStatus = "PLANNING" | "ACTIVE" | "PAUSED" | "COMPLETED" | "ARCHIVED";
export type InitiativeStatus = "BACKLOG" | "PLANNING" | "IN_PROGRESS" | "REVIEW" | "BLOCKED" | "COMPLETED" | "CANCELLED";
export type AgentRole = "ADVOCACY_PM" | "RESEARCH_INTELLIGENCE" | "COALITION_BUILDER" | "STANDUP_REPORTER";
export type AgentRunStatus = "PENDING" | "RUNNING" | "AWAITING_APPROVAL" | "COMPLETED" | "FAILED" | "CANCELLED";
export type EvidenceType = "PUBLICATION" | "CLINICAL_TRIAL" | "FDA_GUIDANCE" | "CONGRESSIONAL_RECORD" | "PRESS_RELEASE" | "PATIENT_TESTIMONY" | "EXPERT_OPINION" | "SYSTEMATIC_REVIEW" | "META_ANALYSIS" | "REAL_WORLD_DATA" | "BIOMARKER_DATA" | "POLICY_BRIEF";
export type EvidenceStrength = "STRONG" | "MODERATE" | "WEAK" | "ANECDOTAL";

// ─── MCP Tool Types ───────────────────────────────────────────────────────────

export interface MCPToolResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

// ─── Agent Types ──────────────────────────────────────────────────────────────

export interface AgentRunInput {
  workspaceId: string;
  role: AgentRole;
  message: string;
  context?: {
    orgId?: string;
    campaignId?: string;
    initiativeId?: string;
    taskId?: string;
  };
}

export interface AgentRunOutput {
  runId: string;
  status: AgentRunStatus;
  result?: string;
  tasksCreated?: number;
  evidenceFound?: number;
  error?: string;
}

export interface ApprovalRequest {
  runId: string;
  message: string;
  proposedActions: ProposedAction[];
}

export interface ProposedAction {
  type: string;
  description: string;
  entityType: string;
  entityData: Record<string, unknown>;
}

// ─── CAID Hierarchy Slugs ─────────────────────────────────────────────────────

export interface CAIDSlugPath {
  workspaceSlug: string;
  orgSlug?: string;
  campaignSlug?: string;
  initiativeSlug?: string;
  taskSlug?: string;
}

// ─── Search ───────────────────────────────────────────────────────────────────

export interface SearchResult {
  id: string;
  type: "workspace" | "org" | "campaign" | "initiative" | "task" | "evidence" | "trial" | "biomarker" | "patient_story" | "page";
  title: string;
  description?: string;
  url: string;
  score: number;
  highlights?: string[];
}

// ─── Dashboard / Analytics ────────────────────────────────────────────────────

export interface WorkspaceDashboard {
  workspaceId: string;
  totalOrgs: number;
  totalCampaigns: number;
  activeCampaigns: number;
  totalInitiatives: number;
  totalTasks: number;
  completedTasks: number;
  totalEvidence: number;
  totalTrials: number;
  totalBiomarkers: number;
  totalPatientStories: number;
  agentRunsToday: number;
  recentActivity: ActivityItem[];
}

export interface ActivityItem {
  id: string;
  type: string;
  description: string;
  entityType: string;
  entityId: string;
  entityTitle: string;
  userId?: string;
  userName?: string;
  agentRole?: AgentRole;
  createdAt: string;
}

// ─── Kanban ───────────────────────────────────────────────────────────────────

export interface KanbanColumn {
  id: TaskStatus;
  title: string;
  color: string;
  tasks: KanbanTask[];
}

export interface KanbanTask {
  id: string;
  slug: string;
  title: string;
  priority: Priority;
  assignee?: { id: string; name: string; avatarUrl?: string };
  labels: string[];
  dueDate?: string;
  agentCreated: boolean;
  storyPoints?: number;
  commentCount: number;
}

// ─── Evidence Board ───────────────────────────────────────────────────────────

export interface EvidenceCard {
  id: string;
  title: string;
  summary?: string;
  evidenceType: EvidenceType;
  strength: EvidenceStrength;
  source?: string;
  publishedAt?: string;
  cancerTypes: string[];
  biomarkers: string[];
  relevanceScore?: number;
  aiSummary?: string;
  sourceUrl?: string;
  doi?: string;
  pmid?: string;
}

// ─── Campaign Timeline ────────────────────────────────────────────────────────

export interface TimelineItem {
  id: string;
  type: "initiative" | "task" | "milestone" | "policy_deadline";
  title: string;
  startDate?: string;
  endDate?: string;
  status: string;
  priority: Priority;
  color: string;
}
