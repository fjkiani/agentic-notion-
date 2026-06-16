#!/bin/bash
set -euo pipefail

echo "=== Zeta CAID MCP Server Build ==="
node --version
pnpm --version

export NODE_ENV=development

echo "Installing dependencies..."
pnpm install --frozen-lockfile
echo "pnpm install done"

echo "Building packages..."
pnpm --filter @zeta/db run build
pnpm --filter @zeta/shared run build
pnpm --filter @zeta/types run build
pnpm --filter @zeta/mcp-server run build

echo "Applying database schema..."
pnpm --filter @zeta/db exec prisma db push --schema=prisma/schema.prisma --skip-generate --accept-data-loss
echo "Database schema applied"

echo "=== Build Complete ==="
ls apps/mcp-server/dist/
