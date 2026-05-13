#!/bin/bash
set -e

echo "=== Zeta CAID MCP Server Build ==="
echo "Node: $(node --version)"
echo "npm: $(npm --version)"
echo "Working dir: $(pwd)"

# Install pnpm globally
echo "Installing pnpm..."
npm install -g pnpm@9.15.0
echo "pnpm version: $(pnpm --version)"

# Install workspace dependencies
echo "Running pnpm install..."
pnpm install

echo "Checking node_modules/.bin..."
ls node_modules/.bin/ | grep -E "prisma|tsc" | head -10 || echo "checking packages..."
ls packages/db/node_modules/.bin/ 2>/dev/null | grep prisma || echo "no prisma in packages/db"

# Generate Prisma client
echo "Generating Prisma client..."
cd packages/db
npx --yes prisma@5 generate
cd ../..

# Build packages in dependency order
echo "Building @zeta/db..."
pnpm --filter @zeta/db run build

echo "Building @zeta/shared..."
pnpm --filter @zeta/shared run build

echo "Building @zeta/types..."
pnpm --filter @zeta/types run build

echo "Building @zeta/mcp-server..."
pnpm --filter @zeta/mcp-server run build

echo "=== Build Complete ==="
ls apps/mcp-server/dist/ | head -5
