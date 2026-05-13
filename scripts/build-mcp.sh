#!/bin/bash
set -e

echo "=== Zeta CAID MCP Server Build ==="
echo "Node: $(node --version)"
echo "npm: $(npm --version)"
echo "Working dir: $(pwd)"
echo "Files: $(ls)"

# Install pnpm via npx
echo "Installing pnpm..."
npx --yes pnpm@9.15.0 install --ignore-scripts

echo "pnpm installed, checking node_modules..."
ls node_modules/.bin/ | grep -E "prisma|pnpm" || echo "No prisma/pnpm in .bin"

# Generate Prisma client using the installed prisma binary
echo "Generating Prisma client..."
node_modules/.bin/prisma generate --schema=packages/db/prisma/schema.prisma || npx --yes prisma@5.22.0 generate --schema=packages/db/prisma/schema.prisma

echo "Building packages..."
node_modules/.bin/pnpm --filter @zeta/db run build
node_modules/.bin/pnpm --filter @zeta/shared run build
node_modules/.bin/pnpm --filter @zeta/types run build
node_modules/.bin/pnpm --filter @zeta/mcp-server run build

echo "=== Build Complete ==="
