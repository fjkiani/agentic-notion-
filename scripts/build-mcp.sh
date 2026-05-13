#!/bin/bash
set -eo pipefail

echo "=== Zeta CAID MCP Server Build ==="
echo "Node: $(node --version)"
echo "npm: $(npm --version)"

# Use npx to run pnpm (avoids PATH issues with global installs)
PNPM="npx --yes pnpm@9.15.0"

echo "Installing dependencies..."
$PNPM install

echo "Generating Prisma client..."
cd packages/db
$PNPM exec prisma generate 2>&1 || echo "Prisma generate failed (may be ok if client is pre-generated)"
cd ../..

echo "Building @zeta/db..."
cd packages/db && $PNPM exec tsc && cd ../..

echo "Copying generated client to dist/..."
mkdir -p packages/db/dist/generated/client
cp -r packages/db/src/generated/client/* packages/db/dist/generated/client/

echo "Building @zeta/shared..."
cd packages/shared && $PNPM exec tsc && cd ../..

echo "Building @zeta/types..."
cd packages/types && $PNPM exec tsc && cd ../..

echo "Building @zeta/mcp-server..."
cd apps/mcp-server && $PNPM exec tsc && cd ../..

echo "=== Build Complete ==="
ls apps/mcp-server/dist/
