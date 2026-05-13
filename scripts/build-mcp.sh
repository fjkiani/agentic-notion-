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

# Check if Prisma client exists
echo "Checking Prisma client..."
ls node_modules/.prisma/client/ 2>/dev/null | head -5 || echo "No .prisma/client in root"
ls node_modules/@prisma/client/ 2>/dev/null | head -5 || echo "No @prisma/client in root"

# Build all packages using turbo (skip db:generate)
echo "Building all packages with turbo..."
pnpm run build

echo "=== Build Complete ==="
ls apps/mcp-server/dist/ | head -5
