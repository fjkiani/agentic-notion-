#!/bin/bash
set -e

echo "=== Zeta CAID MCP Server Build ==="
echo "Node: $(node --version)"

# Install pnpm globally
npm install -g pnpm@9.15.0
echo "pnpm: $(pnpm --version)"

# Install workspace dependencies
pnpm install

# Generate Prisma client
echo "Generating Prisma client..."
cd packages/db && pnpm run db:generate && cd ../..

# Build all packages
echo "Building all packages..."
pnpm run --recursive --if-present build

echo "=== Build Complete ==="
ls apps/mcp-server/dist/ | head -5
