#!/bin/bash
set -e

echo "=== Zeta CAID MCP Server Build ==="
echo "Node: $(node --version)"
echo "npm: $(npm --version)"

# Install pnpm globally
echo "Installing pnpm..."
npm install -g pnpm@9.15.0
echo "pnpm: $(pnpm --version)"

# Install workspace dependencies
echo "Running pnpm install..."
pnpm install

# Generate Prisma client (uses library engine, no binary download needed)
echo "Generating Prisma client..."
pnpm --filter @zeta/db run db:generate
echo "Prisma client generated"

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
