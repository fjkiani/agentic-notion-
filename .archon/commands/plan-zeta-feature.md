# Plan CAID Feature

You are planning a new feature for CAID (Cancer Advocacy Intelligence Database).

## Context

Read `.archon/skills/zeta-codebase.md` for architecture conventions.
Read `$ARTIFACTS_DIR/exploration.md` for codebase findings.

## Your task

Create a detailed, step-by-step implementation plan.

## Plan format

Save to `$ARTIFACTS_DIR/plan.md`:

```markdown
# Implementation Plan: [Feature Name]

## Summary
[2-3 sentence description of what will be built]

## Files to Create
- `path/to/new/file.ts` — [purpose]

## Files to Modify  
- `path/to/existing/file.ts` — [what changes]

## Tasks
- [ ] Task 1: [specific, atomic implementation step]
- [ ] Task 2: [specific, atomic implementation step]
- [ ] Task 3: [specific, atomic implementation step]
...

## Validation
- [ ] pnpm run typecheck passes
- [ ] pnpm run lint passes
- [ ] pnpm run build passes

## Testing
[How to manually verify the feature works]
```

## Rules

- Each task must be atomic (one file, one function, one component)
- Tasks must be in dependency order
- Include all necessary imports and type changes
- Include database migrations if schema changes are needed
- Include MCP tool additions if new data is exposed
- Include UI route additions if new pages are needed
