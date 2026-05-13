
Object.defineProperty(exports, "__esModule", { value: true });

const {
  Decimal,
  objectEnumValues,
  makeStrictEnum,
  Public,
  getRuntime,
  skip
} = require('./runtime/index-browser.js')


const Prisma = {}

exports.Prisma = Prisma
exports.$Enums = {}

/**
 * Prisma Client JS version: 5.22.0
 * Query Engine version: 605197351a3c8bdd595af2d2a9bc3025bca48ea2
 */
Prisma.prismaVersion = {
  client: "5.22.0",
  engine: "605197351a3c8bdd595af2d2a9bc3025bca48ea2"
}

Prisma.PrismaClientKnownRequestError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientKnownRequestError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)};
Prisma.PrismaClientUnknownRequestError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientUnknownRequestError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientRustPanicError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientRustPanicError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientInitializationError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientInitializationError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientValidationError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientValidationError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.NotFoundError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`NotFoundError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.Decimal = Decimal

/**
 * Re-export of sql-template-tag
 */
Prisma.sql = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`sqltag is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.empty = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`empty is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.join = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`join is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.raw = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`raw is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.validator = Public.validator

/**
* Extensions
*/
Prisma.getExtensionContext = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`Extensions.getExtensionContext is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.defineExtension = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`Extensions.defineExtension is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}

/**
 * Shorthand utilities for JSON filtering
 */
Prisma.DbNull = objectEnumValues.instances.DbNull
Prisma.JsonNull = objectEnumValues.instances.JsonNull
Prisma.AnyNull = objectEnumValues.instances.AnyNull

Prisma.NullTypes = {
  DbNull: objectEnumValues.classes.DbNull,
  JsonNull: objectEnumValues.classes.JsonNull,
  AnyNull: objectEnumValues.classes.AnyNull
}



/**
 * Enums
 */

exports.Prisma.TransactionIsolationLevel = makeStrictEnum({
  ReadUncommitted: 'ReadUncommitted',
  ReadCommitted: 'ReadCommitted',
  RepeatableRead: 'RepeatableRead',
  Serializable: 'Serializable'
});

exports.Prisma.UserScalarFieldEnum = {
  id: 'id',
  clerkId: 'clerkId',
  email: 'email',
  name: 'name',
  avatarUrl: 'avatarUrl',
  role: 'role',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.WorkspaceScalarFieldEnum = {
  id: 'id',
  slug: 'slug',
  name: 'name',
  description: 'description',
  logoUrl: 'logoUrl',
  settings: 'settings',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.WorkspaceMemberScalarFieldEnum = {
  id: 'id',
  workspaceId: 'workspaceId',
  userId: 'userId',
  role: 'role',
  joinedAt: 'joinedAt'
};

exports.Prisma.AdvocacyOrgScalarFieldEnum = {
  id: 'id',
  slug: 'slug',
  workspaceId: 'workspaceId',
  name: 'name',
  shortName: 'shortName',
  description: 'description',
  mission: 'mission',
  website: 'website',
  logoUrl: 'logoUrl',
  cancerTypes: 'cancerTypes',
  orgType: 'orgType',
  taxId: 'taxId',
  foundedYear: 'foundedYear',
  memberCount: 'memberCount',
  annualBudget: 'annualBudget',
  headquarters: 'headquarters',
  socialLinks: 'socialLinks',
  metadata: 'metadata',
  status: 'status',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.OrgContactScalarFieldEnum = {
  id: 'id',
  orgId: 'orgId',
  name: 'name',
  title: 'title',
  email: 'email',
  phone: 'phone',
  role: 'role',
  isPrimary: 'isPrimary',
  createdAt: 'createdAt'
};

exports.Prisma.CampaignScalarFieldEnum = {
  id: 'id',
  slug: 'slug',
  orgId: 'orgId',
  name: 'name',
  description: 'description',
  objective: 'objective',
  cancerTypes: 'cancerTypes',
  targetAudience: 'targetAudience',
  status: 'status',
  priority: 'priority',
  startDate: 'startDate',
  endDate: 'endDate',
  budget: 'budget',
  budgetSpent: 'budgetSpent',
  kpis: 'kpis',
  tags: 'tags',
  metadata: 'metadata',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.InitiativeScalarFieldEnum = {
  id: 'id',
  slug: 'slug',
  campaignId: 'campaignId',
  name: 'name',
  description: 'description',
  type: 'type',
  status: 'status',
  priority: 'priority',
  startDate: 'startDate',
  dueDate: 'dueDate',
  completedAt: 'completedAt',
  estimatedHours: 'estimatedHours',
  actualHours: 'actualHours',
  successCriteria: 'successCriteria',
  metadata: 'metadata',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.TaskScalarFieldEnum = {
  id: 'id',
  slug: 'slug',
  initiativeId: 'initiativeId',
  parentTaskId: 'parentTaskId',
  title: 'title',
  description: 'description',
  type: 'type',
  status: 'status',
  priority: 'priority',
  assigneeId: 'assigneeId',
  creatorId: 'creatorId',
  dueDate: 'dueDate',
  completedAt: 'completedAt',
  estimatedHours: 'estimatedHours',
  actualHours: 'actualHours',
  storyPoints: 'storyPoints',
  labels: 'labels',
  agentCreated: 'agentCreated',
  agentRunId: 'agentRunId',
  metadata: 'metadata',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.EvidenceScalarFieldEnum = {
  id: 'id',
  initiativeId: 'initiativeId',
  taskId: 'taskId',
  title: 'title',
  summary: 'summary',
  content: 'content',
  evidenceType: 'evidenceType',
  source: 'source',
  sourceUrl: 'sourceUrl',
  doi: 'doi',
  pmid: 'pmid',
  publishedAt: 'publishedAt',
  authors: 'authors',
  cancerTypes: 'cancerTypes',
  biomarkers: 'biomarkers',
  strength: 'strength',
  relevanceScore: 'relevanceScore',
  aiSummary: 'aiSummary',
  tags: 'tags',
  metadata: 'metadata',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ClinicalTrialScalarFieldEnum = {
  id: 'id',
  nctId: 'nctId',
  title: 'title',
  phase: 'phase',
  status: 'status',
  sponsor: 'sponsor',
  conditions: 'conditions',
  interventions: 'interventions',
  biomarkers: 'biomarkers',
  primaryEndpoint: 'primaryEndpoint',
  enrollment: 'enrollment',
  startDate: 'startDate',
  completionDate: 'completionDate',
  resultsUrl: 'resultsUrl',
  summary: 'summary',
  aiSummary: 'aiSummary',
  advocacyNotes: 'advocacyNotes',
  metadata: 'metadata',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.CampaignTrialScalarFieldEnum = {
  id: 'id',
  campaignId: 'campaignId',
  trialId: 'trialId',
  notes: 'notes',
  addedAt: 'addedAt'
};

exports.Prisma.BiomarkerScalarFieldEnum = {
  id: 'id',
  symbol: 'symbol',
  name: 'name',
  aliases: 'aliases',
  geneId: 'geneId',
  cancerTypes: 'cancerTypes',
  biomarkerType: 'biomarkerType',
  clinicalSignificance: 'clinicalSignificance',
  fdaApproved: 'fdaApproved',
  fdaApprovedDrugs: 'fdaApprovedDrugs',
  companionDx: 'companionDx',
  prevalence: 'prevalence',
  advocacyPriority: 'advocacyPriority',
  aiSummary: 'aiSummary',
  metadata: 'metadata',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.CampaignBiomarkerScalarFieldEnum = {
  id: 'id',
  campaignId: 'campaignId',
  biomarkerId: 'biomarkerId',
  notes: 'notes',
  addedAt: 'addedAt'
};

exports.Prisma.TrialBiomarkerScalarFieldEnum = {
  id: 'id',
  trialId: 'trialId',
  biomarkerId: 'biomarkerId',
  role: 'role'
};

exports.Prisma.PatientStoryScalarFieldEnum = {
  id: 'id',
  orgId: 'orgId',
  authorId: 'authorId',
  title: 'title',
  slug: 'slug',
  content: 'content',
  summary: 'summary',
  cancerType: 'cancerType',
  diagnosisYear: 'diagnosisYear',
  stage: 'stage',
  biomarkers: 'biomarkers',
  treatmentPath: 'treatmentPath',
  outcome: 'outcome',
  isAnonymized: 'isAnonymized',
  consentGiven: 'consentGiven',
  publishedAt: 'publishedAt',
  status: 'status',
  aiSummary: 'aiSummary',
  advocacyThemes: 'advocacyThemes',
  metadata: 'metadata',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.CoalitionScalarFieldEnum = {
  id: 'id',
  slug: 'slug',
  name: 'name',
  description: 'description',
  focusAreas: 'focusAreas',
  status: 'status',
  foundedAt: 'foundedAt',
  website: 'website',
  metadata: 'metadata',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.CoalitionMemberScalarFieldEnum = {
  id: 'id',
  coalitionId: 'coalitionId',
  orgId: 'orgId',
  role: 'role',
  joinedAt: 'joinedAt'
};

exports.Prisma.PolicyTargetScalarFieldEnum = {
  id: 'id',
  orgId: 'orgId',
  campaignId: 'campaignId',
  coalitionId: 'coalitionId',
  title: 'title',
  description: 'description',
  targetType: 'targetType',
  jurisdiction: 'jurisdiction',
  agency: 'agency',
  billNumber: 'billNumber',
  status: 'status',
  priority: 'priority',
  deadline: 'deadline',
  aiSummary: 'aiSummary',
  metadata: 'metadata',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.PageScalarFieldEnum = {
  id: 'id',
  workspaceId: 'workspaceId',
  orgId: 'orgId',
  campaignId: 'campaignId',
  initiativeId: 'initiativeId',
  parentPageId: 'parentPageId',
  title: 'title',
  slug: 'slug',
  icon: 'icon',
  coverUrl: 'coverUrl',
  isPublic: 'isPublic',
  publishedAt: 'publishedAt',
  metadata: 'metadata',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.BlockScalarFieldEnum = {
  id: 'id',
  pageId: 'pageId',
  parentBlockId: 'parentBlockId',
  type: 'type',
  content: 'content',
  order: 'order',
  metadata: 'metadata',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.AgentRunScalarFieldEnum = {
  id: 'id',
  workspaceId: 'workspaceId',
  userId: 'userId',
  role: 'role',
  status: 'status',
  input: 'input',
  output: 'output',
  graphState: 'graphState',
  mcpToolCalls: 'mcpToolCalls',
  errorMessage: 'errorMessage',
  startedAt: 'startedAt',
  completedAt: 'completedAt',
  durationMs: 'durationMs',
  tokenCount: 'tokenCount',
  model: 'model',
  metadata: 'metadata'
};

exports.Prisma.AgentMessageScalarFieldEnum = {
  id: 'id',
  runId: 'runId',
  role: 'role',
  content: 'content',
  toolName: 'toolName',
  toolInput: 'toolInput',
  toolOutput: 'toolOutput',
  thinking: 'thinking',
  order: 'order',
  createdAt: 'createdAt'
};

exports.Prisma.DataSourceScalarFieldEnum = {
  id: 'id',
  workspaceId: 'workspaceId',
  name: 'name',
  type: 'type',
  config: 'config',
  lastSyncAt: 'lastSyncAt',
  syncStatus: 'syncStatus',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.CommentScalarFieldEnum = {
  id: 'id',
  taskId: 'taskId',
  authorId: 'authorId',
  content: 'content',
  isResolved: 'isResolved',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.AuditLogScalarFieldEnum = {
  id: 'id',
  workspaceId: 'workspaceId',
  userId: 'userId',
  action: 'action',
  entityType: 'entityType',
  entityId: 'entityId',
  before: 'before',
  after: 'after',
  ipAddress: 'ipAddress',
  userAgent: 'userAgent',
  createdAt: 'createdAt'
};

exports.Prisma.SortOrder = {
  asc: 'asc',
  desc: 'desc'
};

exports.Prisma.JsonNullValueInput = {
  JsonNull: Prisma.JsonNull
};

exports.Prisma.NullableJsonNullValueInput = {
  DbNull: Prisma.DbNull,
  JsonNull: Prisma.JsonNull
};

exports.Prisma.QueryMode = {
  default: 'default',
  insensitive: 'insensitive'
};

exports.Prisma.NullsOrder = {
  first: 'first',
  last: 'last'
};

exports.Prisma.JsonNullValueFilter = {
  DbNull: Prisma.DbNull,
  JsonNull: Prisma.JsonNull,
  AnyNull: Prisma.AnyNull
};
exports.UserRole = exports.$Enums.UserRole = {
  ADMIN: 'ADMIN',
  MEMBER: 'MEMBER',
  VIEWER: 'VIEWER',
  AGENT: 'AGENT'
};

exports.WorkspaceRole = exports.$Enums.WorkspaceRole = {
  OWNER: 'OWNER',
  ADMIN: 'ADMIN',
  MEMBER: 'MEMBER',
  VIEWER: 'VIEWER'
};

exports.OrgType = exports.$Enums.OrgType = {
  NONPROFIT: 'NONPROFIT',
  FOUNDATION: 'FOUNDATION',
  PATIENT_GROUP: 'PATIENT_GROUP',
  RESEARCH_INSTITUTE: 'RESEARCH_INSTITUTE',
  GOVERNMENT: 'GOVERNMENT',
  INDUSTRY: 'INDUSTRY',
  COALITION: 'COALITION'
};

exports.OrgStatus = exports.$Enums.OrgStatus = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
  MERGED: 'MERGED',
  DISSOLVED: 'DISSOLVED'
};

exports.ContactRole = exports.$Enums.ContactRole = {
  EXECUTIVE: 'EXECUTIVE',
  SCIENTIFIC: 'SCIENTIFIC',
  POLICY: 'POLICY',
  COMMUNICATIONS: 'COMMUNICATIONS',
  FUNDRAISING: 'FUNDRAISING',
  GENERAL: 'GENERAL'
};

exports.CampaignStatus = exports.$Enums.CampaignStatus = {
  PLANNING: 'PLANNING',
  ACTIVE: 'ACTIVE',
  PAUSED: 'PAUSED',
  COMPLETED: 'COMPLETED',
  ARCHIVED: 'ARCHIVED'
};

exports.Priority = exports.$Enums.Priority = {
  CRITICAL: 'CRITICAL',
  HIGH: 'HIGH',
  MEDIUM: 'MEDIUM',
  LOW: 'LOW'
};

exports.InitiativeType = exports.$Enums.InitiativeType = {
  POLICY_ADVOCACY: 'POLICY_ADVOCACY',
  RESEARCH_FUNDING: 'RESEARCH_FUNDING',
  PATIENT_SUPPORT: 'PATIENT_SUPPORT',
  AWARENESS: 'AWARENESS',
  COALITION_BUILDING: 'COALITION_BUILDING',
  REGULATORY_ENGAGEMENT: 'REGULATORY_ENGAGEMENT',
  CLINICAL_TRIAL_ACCESS: 'CLINICAL_TRIAL_ACCESS',
  BIOMARKER_ADVOCACY: 'BIOMARKER_ADVOCACY',
  MEDIA_CAMPAIGN: 'MEDIA_CAMPAIGN',
  GENERAL: 'GENERAL'
};

exports.InitiativeStatus = exports.$Enums.InitiativeStatus = {
  BACKLOG: 'BACKLOG',
  PLANNING: 'PLANNING',
  IN_PROGRESS: 'IN_PROGRESS',
  REVIEW: 'REVIEW',
  BLOCKED: 'BLOCKED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED'
};

exports.TaskType = exports.$Enums.TaskType = {
  ACTION: 'ACTION',
  RESEARCH: 'RESEARCH',
  MEETING: 'MEETING',
  DOCUMENT: 'DOCUMENT',
  OUTREACH: 'OUTREACH',
  REVIEW: 'REVIEW',
  APPROVAL: 'APPROVAL',
  MILESTONE: 'MILESTONE'
};

exports.TaskStatus = exports.$Enums.TaskStatus = {
  TODO: 'TODO',
  IN_PROGRESS: 'IN_PROGRESS',
  IN_REVIEW: 'IN_REVIEW',
  BLOCKED: 'BLOCKED',
  DONE: 'DONE',
  CANCELLED: 'CANCELLED'
};

exports.EvidenceType = exports.$Enums.EvidenceType = {
  PUBLICATION: 'PUBLICATION',
  CLINICAL_TRIAL: 'CLINICAL_TRIAL',
  FDA_GUIDANCE: 'FDA_GUIDANCE',
  CONGRESSIONAL_RECORD: 'CONGRESSIONAL_RECORD',
  PRESS_RELEASE: 'PRESS_RELEASE',
  PATIENT_TESTIMONY: 'PATIENT_TESTIMONY',
  EXPERT_OPINION: 'EXPERT_OPINION',
  SYSTEMATIC_REVIEW: 'SYSTEMATIC_REVIEW',
  META_ANALYSIS: 'META_ANALYSIS',
  REAL_WORLD_DATA: 'REAL_WORLD_DATA',
  BIOMARKER_DATA: 'BIOMARKER_DATA',
  POLICY_BRIEF: 'POLICY_BRIEF'
};

exports.EvidenceStrength = exports.$Enums.EvidenceStrength = {
  STRONG: 'STRONG',
  MODERATE: 'MODERATE',
  WEAK: 'WEAK',
  ANECDOTAL: 'ANECDOTAL'
};

exports.TrialPhase = exports.$Enums.TrialPhase = {
  PHASE_1: 'PHASE_1',
  PHASE_1_2: 'PHASE_1_2',
  PHASE_2: 'PHASE_2',
  PHASE_2_3: 'PHASE_2_3',
  PHASE_3: 'PHASE_3',
  PHASE_4: 'PHASE_4',
  NOT_APPLICABLE: 'NOT_APPLICABLE'
};

exports.TrialStatus = exports.$Enums.TrialStatus = {
  NOT_YET_RECRUITING: 'NOT_YET_RECRUITING',
  RECRUITING: 'RECRUITING',
  ACTIVE_NOT_RECRUITING: 'ACTIVE_NOT_RECRUITING',
  COMPLETED: 'COMPLETED',
  TERMINATED: 'TERMINATED',
  WITHDRAWN: 'WITHDRAWN',
  SUSPENDED: 'SUSPENDED',
  UNKNOWN: 'UNKNOWN'
};

exports.BiomarkerType = exports.$Enums.BiomarkerType = {
  GENETIC: 'GENETIC',
  PROTEIN_EXPRESSION: 'PROTEIN_EXPRESSION',
  EPIGENETIC: 'EPIGENETIC',
  METABOLIC: 'METABOLIC',
  IMAGING: 'IMAGING',
  LIQUID_BIOPSY: 'LIQUID_BIOPSY'
};

exports.StoryOutcome = exports.$Enums.StoryOutcome = {
  ONGOING: 'ONGOING',
  REMISSION: 'REMISSION',
  SURVIVOR: 'SURVIVOR',
  DECEASED: 'DECEASED',
  UNKNOWN: 'UNKNOWN'
};

exports.StoryStatus = exports.$Enums.StoryStatus = {
  DRAFT: 'DRAFT',
  REVIEW: 'REVIEW',
  PUBLISHED: 'PUBLISHED',
  ARCHIVED: 'ARCHIVED'
};

exports.CoalitionStatus = exports.$Enums.CoalitionStatus = {
  FORMING: 'FORMING',
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
  DISSOLVED: 'DISSOLVED'
};

exports.PolicyTargetType = exports.$Enums.PolicyTargetType = {
  LEGISLATION: 'LEGISLATION',
  REGULATION: 'REGULATION',
  GUIDANCE: 'GUIDANCE',
  COVERAGE_POLICY: 'COVERAGE_POLICY',
  REIMBURSEMENT: 'REIMBURSEMENT',
  GRANT_PROGRAM: 'GRANT_PROGRAM'
};

exports.PolicyStatus = exports.$Enums.PolicyStatus = {
  MONITORING: 'MONITORING',
  ACTIVE_ENGAGEMENT: 'ACTIVE_ENGAGEMENT',
  SUBMITTED: 'SUBMITTED',
  UNDER_REVIEW: 'UNDER_REVIEW',
  PASSED: 'PASSED',
  FAILED: 'FAILED',
  WITHDRAWN: 'WITHDRAWN'
};

exports.AgentRole = exports.$Enums.AgentRole = {
  ADVOCACY_PM: 'ADVOCACY_PM',
  RESEARCH_INTELLIGENCE: 'RESEARCH_INTELLIGENCE',
  COALITION_BUILDER: 'COALITION_BUILDER',
  STANDUP_REPORTER: 'STANDUP_REPORTER'
};

exports.AgentRunStatus = exports.$Enums.AgentRunStatus = {
  PENDING: 'PENDING',
  RUNNING: 'RUNNING',
  AWAITING_APPROVAL: 'AWAITING_APPROVAL',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED'
};

exports.DataSourceType = exports.$Enums.DataSourceType = {
  PUBMED: 'PUBMED',
  CLINICALTRIALS_GOV: 'CLINICALTRIALS_GOV',
  FDA_DRUGS: 'FDA_DRUGS',
  CONGRESS_GOV: 'CONGRESS_GOV',
  OPEN_PAYMENTS: 'OPEN_PAYMENTS',
  CUSTOM_API: 'CUSTOM_API',
  CSV_UPLOAD: 'CSV_UPLOAD'
};

exports.Prisma.ModelName = {
  User: 'User',
  Workspace: 'Workspace',
  WorkspaceMember: 'WorkspaceMember',
  AdvocacyOrg: 'AdvocacyOrg',
  OrgContact: 'OrgContact',
  Campaign: 'Campaign',
  Initiative: 'Initiative',
  Task: 'Task',
  Evidence: 'Evidence',
  ClinicalTrial: 'ClinicalTrial',
  CampaignTrial: 'CampaignTrial',
  Biomarker: 'Biomarker',
  CampaignBiomarker: 'CampaignBiomarker',
  TrialBiomarker: 'TrialBiomarker',
  PatientStory: 'PatientStory',
  Coalition: 'Coalition',
  CoalitionMember: 'CoalitionMember',
  PolicyTarget: 'PolicyTarget',
  Page: 'Page',
  Block: 'Block',
  AgentRun: 'AgentRun',
  AgentMessage: 'AgentMessage',
  DataSource: 'DataSource',
  Comment: 'Comment',
  AuditLog: 'AuditLog'
};

/**
 * This is a stub Prisma Client that will error at runtime if called.
 */
class PrismaClient {
  constructor() {
    return new Proxy(this, {
      get(target, prop) {
        let message
        const runtime = getRuntime()
        if (runtime.isEdge) {
          message = `PrismaClient is not configured to run in ${runtime.prettyName}. In order to run Prisma Client on edge runtime, either:
- Use Prisma Accelerate: https://pris.ly/d/accelerate
- Use Driver Adapters: https://pris.ly/d/driver-adapters
`;
        } else {
          message = 'PrismaClient is unable to run in this browser environment, or has been bundled for the browser (running in `' + runtime.prettyName + '`).'
        }
        
        message += `
If this is unexpected, please open an issue: https://pris.ly/prisma-prisma-bug-report`

        throw new Error(message)
      }
    })
  }
}

exports.PrismaClient = PrismaClient

Object.assign(exports, Prisma)
