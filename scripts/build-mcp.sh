#!/bin/bash
set -eo pipefail

echo "=== Zeta CAID MCP Server Build ==="
echo "Node: $(node --version)"
echo "npm: $(npm --version)"

# Enable corepack to use pnpm from packageManager field
corepack enable || true
corepack prepare pnpm@9.15.0 --activate || true

echo "pnpm: $(pnpm --version)"

# Install workspace dependencies
echo "Installing dependencies..."
pnpm install --frozen-lockfile

echo "Skipping prisma generate (client is pre-committed to repo)"

echo "Building @zeta/db..."
cd packages/db
../../node_modules/.bin/tsc
cd ../..

echo "Copying generated client to dist/..."
mkdir -p packages/db/dist/generated/client
cp -r packages/db/src/generated/client/* packages/db/dist/generated/client/

echo "Building @zeta/shared..."
cd packages/shared
../../node_modules/.bin/tsc
cd ../..

echo "Building @zeta/types..."
cd packages/types
../../node_modules/.bin/tsc
cd ../..

echo "Building @zeta/mcp-server..."
cd apps/mcp-server
../../node_modules/.bin/tsc
cd ../..

echo "=== Build Complete ==="
ls apps/mcp-server/dist/
