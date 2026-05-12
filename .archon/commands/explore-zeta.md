# Explore CAID Codebase

You are exploring the CAID (Cancer Advocacy Intelligence Database) codebase.

## Your task

1. Read `.archon/skills/zeta-codebase.md` to understand the architecture
2. Read the relevant source files for the task at hand
3. Identify the exact files that need to be modified or created
4. Note any existing patterns to follow

## Key files to read

- `packages/db/prisma/schema.prisma` — full data model
- `apps/mcp-server/src/registry.ts` — tool registry pattern
- `apps/mcp-server/src/tools/task.ts` — example tool implementation
- `apps/agent-api/src/agents/advocacy-pm.ts` — example agent
- `apps/agent-api/src/state.ts` — shared agent state
- `apps/web/src/app/[workspaceSlug]/agents/page.tsx` — example page

## Output

Save your findings to `$ARTIFACTS_DIR/exploration.md`:
- Relevant files and their purposes
- Patterns to follow
- Potential conflicts or dependencies
- Recommended approach
