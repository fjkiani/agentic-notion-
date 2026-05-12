# CAID — Cancer Advocacy Intelligence Database
## Archon Codebase Skill

This skill teaches Archon the architecture, conventions, and patterns of CAID.
Load this skill at the start of every workflow run.

---

## Repository Structure

```
zeta-caid/
├── apps/
│   ├── web/                    Next.js 15 App Router (port 3000)
│   ├── mcp-server/             MCP HTTP + STDIO server (port 3001)
│   └── agent-api/              LangGraph agent API (port 3002)
├── packages/
│   ├── db/                     Prisma + PostgreSQL
│   │   └── prisma/schema.prisma  Full CAID schema
│   ├── shared/                 Zod schemas + slug utilities
│   └── types/                  TypeScript types
├── .archon/
│   ├── workflows/              YAML DAG workflows (this directory)
│   ├── commands/               Markdown command prompts
│   ├── scripts/                TypeScript utility scripts
│   └── skills/                 THIS FILE
├── .cursor/mcp.json            Cursor MCP config (committed)
├── render.yaml                 Render IaC
└── turbo.json                  Turborepo pipeline
```

---

## CAID Data Hierarchy

```
Workspace
└── AdvocacyOrg (slug: org-name)
    ├── Campaign (slug: campaign-name)
    │   ├── Initiative (slug: initiative-name)
    │   │   ├── Task (slug: task-title-N)
    │   │   │   ├── SubTask
    │   │   │   ├── Comment
    │   │   │   └── Evidence
    │   │   └── Evidence
    │   ├── PolicyTarget
    │   ├── ClinicalTrial (via CampaignTrial)
    │   └── Biomarker (via CampaignBiomarker)
    ├── PatientStory
    ├── OrgContact
    └── Page
        └── Block (recursive)

Coalition
└── CoalitionMember (AdvocacyOrg links)

ClinicalTrial (NCT-linked)
Biomarker (gene symbol-keyed)
AgentRun → AgentMessage
```

---

## How to Add a New MCP Tool

1. Find the right tool file in `apps/mcp-server/src/tools/` or create a new one
2. Add a new `MCPToolDefinition` object to the exported array:

```typescript
// apps/mcp-server/src/tools/my-domain.ts
import { z } from "zod";
import { prisma } from "@zeta/db";
import type { MCPToolDefinition } from "../registry.js";

export const myDomainTools: MCPToolDefinition[] = [
  {
    name: "my_tool_name",           // snake_case
    description: "What this tool does and when to use it",
    inputSchema: z.object({
      requiredField: z.string(),
      optionalField: z.string().optional(),
      enumField: z.enum(["A", "B", "C"]).default("A"),
    }),
    handler: async (input) => {
      const { requiredField } = input as { requiredField: string };
      // Implementation
      return { result: "..." };
    },
  },
];
```

3. Import and register in `apps/mcp-server/src/index.ts`:
```typescript
import { myDomainTools } from "./tools/my-domain.js";
// Add to registry.registerAll([...existing..., ...myDomainTools]);
```

4. Run: `cd apps/mcp-server && pnpm run typecheck`

---

## How to Add a New Agent Role

1. Create `apps/agent-api/src/agents/my-agent.ts`:

```typescript
import { StateGraph, END, START } from "@langchain/langgraph";
import { MemorySaver } from "@langchain/langgraph";
import { SystemMessage } from "@langchain/core/messages";
import { createLLM } from "../config/llm.js";
import { createMCPClient } from "../mcp-client.js";
import { CAIDAgentState } from "../state.js";

const SYSTEM_PROMPT = `You are the [Role] Agent for CAID...`;

export async function createMyAgent() {
  const llm = createLLM("FALLBACK"); // or specific model
  const mcpClient = createMCPClient();
  const tools = await mcpClient.toLangChainTools(["tool1", "tool2"]);
  const llmWithTools = llm.bindTools(tools);
  const checkpointer = new MemorySaver();

  // Define nodes, routing, graph...
  const graph = new StateGraph(CAIDAgentState)
    .addNode("main", mainNode)
    .addEdge(START, "main")
    .addEdge("main", END);

  return graph.compile({ checkpointer });
}
```

2. Register in `apps/agent-api/src/agents/registry.ts`:
```typescript
import { createMyAgent } from "./my-agent.js";
// Add to AgentRole type and initialize() method
```

3. Add to `llmConfig` in `apps/agent-api/src/config/llm.ts` if using a new model

4. Run: `cd apps/agent-api && pnpm run typecheck`

---

## How to Add a New UI View

1. Create the view component in `apps/web/src/views/`:
```typescript
// apps/web/src/views/my-view.tsx
"use client";
import { callMCPTool } from "@/lib/api";
// Component implementation
```

2. Add a route in `apps/web/src/app/[workspaceSlug]/`:
```
apps/web/src/app/[workspaceSlug]/my-view/page.tsx
```

3. Register in `apps/web/src/views/registry.ts` (create if missing):
```typescript
export const viewRegistry = {
  kanban: KanbanView,
  myView: MyView,  // Add here
};
```

4. Add navigation link in the sidebar/header

5. Run: `cd apps/web && pnpm run typecheck`

---

## How to Extend the Database Schema

1. Edit `packages/db/prisma/schema.prisma` — ADDITIVE ONLY
2. Rules:
   - Never drop columns or tables
   - Use `String` for enums that might be extended (not `enum` type)
   - Add `metadata Json @default("{}")` to all new models
   - Add `createdAt DateTime @default(now())` and `updatedAt DateTime @updatedAt`
   - Add `@@index` for all foreign keys and frequently queried fields
3. Run migration: `cd packages/db && pnpm run db:migrate -- --name add_my_model`
4. Regenerate client: `cd packages/db && pnpm run db:generate`
5. Update MCP tools to expose the new model

---

## Validation Command

Always run before creating a PR:
```bash
pnpm run validate
# Equivalent to: turbo run typecheck && turbo run lint && turbo run build
```

Individual checks:
```bash
pnpm run typecheck    # TypeScript type checking
pnpm run lint         # ESLint
pnpm run build        # Build all packages
```

---

## Environment Variables

```bash
# Database
DATABASE_URL=postgresql://...

# Clerk Auth
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_...
CLERK_SECRET_KEY=sk_...

# OpenRouter (for agents)
OPENROUTER_API_KEY=sk-or-v1-...

# MCP Server
MCP_AUTH_TOKEN=...
NEXT_PUBLIC_MCP_SERVER_URL=https://agentic-notion-mcp.onrender.com

# Agent API
AGENT_API_TOKEN=...
NEXT_PUBLIC_AGENT_API_URL=https://agentic-notion-agents.onrender.com

# App
APP_URL=https://agentic-notion-web.onrender.com
```

---

## PR Conventions

Branch naming: `archon/[workflow-id]-[short-description]`
Examples:
- `archon/add-feature-timeline-view`
- `archon/add-mcp-tool-fda-search`
- `archon/fix-issue-kanban-mobile`

PR title: `[Archon] [Workflow]: [Description]`
Examples:
- `[Archon] Add Feature: Campaign Timeline View`
- `[Archon] Add MCP Tool: FDA Drug Search`

PR body must include:
- What was added/changed
- Which files were modified
- How to test
- Screenshots (for UI changes)

---

## Key Patterns

### Slug generation
```typescript
import { toSlug } from "@zeta/shared";
const slug = toSlug(name); // "My Campaign Name" → "my-campaign-name"
```

### Prisma queries
```typescript
import { prisma } from "@zeta/db";
// Always use workspace-scoped queries for multi-tenancy
const orgs = await prisma.advocacyOrg.findMany({
  where: { workspaceId },
  include: { _count: { select: { campaigns: true } } },
});
```

### MCP tool handler pattern
```typescript
handler: async (input) => {
  const { field } = input as { field: string };
  // Always validate with Zod schema first (done by registry)
  // Return plain objects (will be JSON.stringify'd)
  return { result: data };
}
```

### LangGraph agent pattern
- Use `CAIDAgentState` from `../state.js` for all agents
- Always include `iterationCount` guard (max 8-10 iterations)
- Always have a `finalize`/`synthesize` terminal node
- Use `MemorySaver` for checkpointing (PostgreSQL checkpointer commented out for MVP)
- Log tool calls to `mcpResults` accumulator

---

## Cancer Advocacy Domain Knowledge

### Cancer types (use these strings consistently)
breast, lung, colorectal, prostate, ovarian, pancreatic, leukemia, lymphoma,
melanoma, bladder, kidney, thyroid, cervical, endometrial, brain, liver

### Key biomarkers
BRCA1, BRCA2, EGFR, ALK, ROS1, KRAS, BRAF, HER2, PD-L1, MSI, TMB,
NTRK, RET, MET, PIK3CA, TP53, CDKN2A, PTEN

### Key advocacy targets
- FDA: Drug approvals, companion diagnostics, biomarker guidance
- CMS: Medicare/Medicaid coverage decisions
- Congress: CANCER Act, 21st Century Cures, appropriations
- State: Medicaid coverage, insurance mandates, research funding

### Evidence hierarchy (strongest to weakest)
1. Systematic review / Meta-analysis
2. Phase 3 RCT
3. Phase 2 trial
4. Cohort study
5. Case series
6. Expert opinion
7. Patient testimony
