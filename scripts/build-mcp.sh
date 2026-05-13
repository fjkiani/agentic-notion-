#!/bin/bash
set -e

echo "=== Zeta CAID MCP Server Build ==="
echo "Node: $(node --version)"
echo "npm: $(npm --version)"
echo "Working dir: $(pwd)"

# Install pnpm via npx
echo "Installing pnpm..."
npx --yes pnpm@9.15.0 install --ignore-scripts

echo "Checking for prisma binary..."
find . -name "prisma" -type f -not -path "*/node_modules/prisma/node_modules/*" 2>/dev/null | head -5 || echo "prisma not found as file"
ls node_modules/.bin/ 2>/dev/null | head -20 || echo "no root .bin"

# Generate Prisma client
echo "Generating Prisma client..."
PRISMA_BIN=$(find . -path "*/node_modules/.bin/prisma" -not -path "*/node_modules/prisma/node_modules/*" 2>/dev/null | head -1)
if [ -n "$PRISMA_BIN" ]; then
  echo "Found prisma at: $PRISMA_BIN"
  $PRISMA_BIN generate --schema=packages/db/prisma/schema.prisma
else
  echo "Prisma not found in node_modules, using npx..."
  npx --yes prisma@5 generate --schema=packages/db/prisma/schema.prisma
fi

echo "Building packages..."
PNPM_BIN=$(find . -path "*/node_modules/.bin/pnpm" 2>/dev/null | head -1)
if [ -n "$PNPM_BIN" ]; then
  $PNPM_BIN --filter @zeta/db run build
  $PNPM_BIN --filter @zeta/shared run build
  $PNPM_BIN --filter @zeta/types run build
  $PNPM_BIN --filter @zeta/mcp-server run build
else
  npx pnpm@9.15.0 --filter @zeta/db run build
  npx pnpm@9.15.0 --filter @zeta/shared run build
  npx pnpm@9.15.0 --filter @zeta/types run build
  npx pnpm@9.15.0 --filter @zeta/mcp-server run build
fi

echo "=== Build Complete ==="
