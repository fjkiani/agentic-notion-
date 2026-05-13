#!/bin/bash
set -e

echo "=== Zeta CAID MCP Server Build ==="
echo "Node: $(node --version)"

# Use pnpm if available, otherwise install
if command -v pnpm &> /dev/null; then
  echo "pnpm available: $(pnpm --version)"
else
  echo "Installing pnpm..."
  npm install -g pnpm@9.15.0
fi

# Install workspace dependencies
echo "Running pnpm install..."
pnpm install

# Skip prisma generate for now - test if TypeScript build works
echo "Building @zeta/db (without prisma generate)..."
pnpm --filter @zeta/db run build || echo "db build failed (expected without prisma generate)"

echo "Building @zeta/shared..."
pnpm --filter @zeta/shared run build

echo "Building @zeta/types..."
pnpm --filter @zeta/types run build

echo "Building @zeta/mcp-server..."
pnpm --filter @zeta/mcp-server run build

echo "=== Build Complete ==="
ls apps/mcp-server/dist/ | head -5
