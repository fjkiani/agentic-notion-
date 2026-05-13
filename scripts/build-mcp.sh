#!/bin/bash
set -eo pipefail

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

# Generate Prisma client
echo "Generating Prisma client..."
PRISMA_BIN=$(find node_modules -name "prisma" -type f 2>/dev/null | grep -v "node_modules/prisma/node_modules" | grep "bin/prisma" | head -1)
if [ -z "$PRISMA_BIN" ]; then
  PRISMA_BIN=$(find node_modules/.pnpm -name "prisma" -type f 2>/dev/null | grep "bin/prisma" | head -1)
fi
echo "Prisma binary: ${PRISMA_BIN:-NOT FOUND}"

if [ -n "$PRISMA_BIN" ]; then
  node "$PRISMA_BIN" generate --schema=packages/db/prisma/schema.prisma
else
  # Try using the prisma package directly
  node -e "require('./node_modules/.pnpm/prisma@5.22.0/node_modules/prisma/build/index.js')" generate --schema=packages/db/prisma/schema.prisma || true
fi

# Build @zeta/db
echo "Building @zeta/db..."
cd packages/db && ../../node_modules/.bin/tsc && cd ../..

# Build @zeta/shared
echo "Building @zeta/shared..."
cd packages/shared && ../../node_modules/.bin/tsc && cd ../..

# Build @zeta/types
echo "Building @zeta/types..."
cd packages/types && ../../node_modules/.bin/tsc && cd ../..

# Build @zeta/mcp-server
echo "Building @zeta/mcp-server..."
cd apps/mcp-server && ../../node_modules/.bin/tsc && cd ../..

echo "=== Build Complete ==="
ls apps/mcp-server/dist/
