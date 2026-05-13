#!/bin/bash

echo "=== Zeta CAID MCP Server Build ==="
echo "Node: $(node --version)"

# Use pnpm if available
if command -v pnpm &> /dev/null; then
  echo "pnpm: $(pnpm --version)"
else
  npm install -g pnpm@9.15.0
fi

# Install workspace dependencies
pnpm install

# Generate Prisma client using direct binary path
echo "Generating Prisma client..."
PRISMA_BIN=$(find node_modules -name "prisma" -type f -path "*/bin/prisma" 2>/dev/null | head -1)
if [ -z "$PRISMA_BIN" ]; then
  PRISMA_BIN=$(find node_modules -name "prisma" -type f 2>/dev/null | grep -v node_modules/prisma/node_modules | head -1)
fi
echo "Prisma binary: $PRISMA_BIN"
if [ -n "$PRISMA_BIN" ]; then
  node "$PRISMA_BIN" generate --schema=packages/db/prisma/schema.prisma
else
  echo "Prisma not found, trying npx..."
  npx prisma generate --schema=packages/db/prisma/schema.prisma
fi
echo "Prisma generate exit: $?"

# Build @zeta/db
echo "Building @zeta/db..."
cd packages/db
../../node_modules/.bin/tsc 2>&1
echo "db build exit: $?"
cd ../..

# Build @zeta/shared
echo "Building @zeta/shared..."
cd packages/shared
../../node_modules/.bin/tsc 2>&1
echo "shared build exit: $?"
cd ../..

# Build @zeta/types
echo "Building @zeta/types..."
cd packages/types
../../node_modules/.bin/tsc 2>&1
echo "types build exit: $?"
cd ../..

# Build @zeta/mcp-server
echo "Building @zeta/mcp-server..."
cd apps/mcp-server
../../node_modules/.bin/tsc 2>&1
echo "mcp build exit: $?"
cd ../..

echo "=== Build Complete ==="
ls apps/mcp-server/dist/ | head -5
