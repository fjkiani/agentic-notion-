#!/bin/bash
set -euo pipefail

echo "=== Zeta CAID Agent API Build ==="
node --version
pnpm --version

# Render sets NODE_ENV=production, which skips devDependencies (typescript, etc.)
export NODE_ENV=development

echo "Installing dependencies..."
pnpm install --frozen-lockfile
echo "pnpm install done"

echo "Building packages..."
pnpm --filter @zeta/db run build
pnpm --filter @zeta/shared run build
pnpm --filter @zeta/types run build
pnpm --filter @zeta/agent-api run build

echo "=== Build Complete ==="
ls apps/agent-api/dist/
