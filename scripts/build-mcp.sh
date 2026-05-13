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

# Generate Prisma client first
echo "Generating Prisma client..."
pnpm run db:generate
echo "Prisma client generated"

# Build all packages using turbo
echo "Building all packages with turbo..."
pnpm run build

echo "=== Build Complete ==="
ls apps/mcp-server/dist/ | head -5
