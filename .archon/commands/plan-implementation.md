# Plan Implementation

You are planning a code change for CAID (Cancer Advocacy Intelligence Database).

## Context

Read `.archon/skills/zeta-codebase.md` for architecture conventions.
Read `$ARTIFACTS_DIR/exploration.md` for codebase findings from the explore step.

Use `claude_code_file_read` to read any additional source files you need to understand
before writing the plan. Use glob patterns to survey a package:
- `apps/mcp-server/src/tools/*.ts` — all MCP tool files
- `apps/agent-api/src/agents/*.ts` — all agent files
- `packages/db/prisma/schema.prisma` — database schema

## Your task

Create a precise, file-level implementation plan and save it to `$ARTIFACTS_DIR/plan.md`.

## Plan format

```markdown
# Implementation Plan: [Change Name]

## Summary
[2-3 sentences describing what will be built and why]

## Files to Create
- `path/to/new/file.ts` — [purpose]

## Files to Modify
- `path/to/existing/file.ts` — [exact change: add X, update Y, remove Z]

## Tasks
- [ ] Task 1: [atomic step — one file, one function, one change]
- [ ] Task 2: [atomic step]
- [ ] Task 3: [atomic step]
...

## Validation
- [ ] pnpm run typecheck passes in affected package(s)
- [ ] pnpm run build passes
- [ ] Manual smoke test: [how to verify the change works]
```

## Rules

- Each task must be **atomic**: one file, one function, one logical change
- Tasks must be in **dependency order** (imports before consumers)
- Include the **exact string to find** for any file edits (so claude_code_file_edit can target it)
- Include all necessary import additions
- If the change adds a new MCP tool: include registering it in `apps/mcp-server/src/index.ts`
- If the change adds a new agent tool: include updating the allowlist in the agent file
- If the change modifies the Prisma schema: include `pnpm run db:push` as a task
- Keep tasks small enough that each can be completed and typechecked independently
