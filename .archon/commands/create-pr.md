# Create GitHub PR

You are creating a GitHub Pull Request for a CAID feature implementation.

## Context

Read `.archon/skills/zeta-codebase.md` for PR conventions.
Read `$ARTIFACTS_DIR/plan.md` for what was implemented.

## Your task

1. Stage all changes: `git add -A`
2. Create a commit: `git commit -m "[Archon] [Workflow]: [Description]"`
3. Push to a new branch: `git push origin archon/[workflow-id]-[short-description]`
4. Create a PR via GitHub CLI or API

## PR format

Title: `[Archon] [Workflow]: [Description]`

Body:
```markdown
## Summary
[What was added/changed]

## Changes
- `path/to/file.ts` — [what changed]

## How to test
1. [Step 1]
2. [Step 2]

## Checklist
- [ ] TypeScript compiles without errors
- [ ] ESLint passes
- [ ] Build succeeds
- [ ] Manual testing completed
```

## GitHub CLI command

```bash
gh pr create \
  --title "[Archon] [Workflow]: [Description]" \
  --body "[PR body]" \
  --base main \
  --head archon/[branch-name]
```

## Output

Save the PR URL to `$ARTIFACTS_DIR/pr-url.txt`
