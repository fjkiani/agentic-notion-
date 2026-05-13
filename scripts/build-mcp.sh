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

# Generate Prisma client to src/generated/client
echo "Generating Prisma client..."
cd packages/db
../node_modules/.bin/prisma generate 2>&1 || ../../node_modules/.bin/prisma generate 2>&1 || node_modules/.bin/prisma generate 2>&1
echo "Prisma generate done"
cd ../..

# Build @zeta/db (compiles src/ to dist/)
echo "Building @zeta/db..."
cd packages/db && ../../node_modules/.bin/tsc && cd ../..

# Copy generated client to dist/ (needed for runtime imports)
echo "Copying generated client to dist/..."
mkdir -p packages/db/dist/generated/client
cp -r packages/db/src/generated/client/* packages/db/dist/generated/client/
echo "Generated client copied"

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
