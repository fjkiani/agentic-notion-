#!/bin/bash
set -eo pipefail

echo "=== Zeta CAID MCP Server Build ==="
echo "Node: $(node --version)"
echo "npm: $(npm --version)"

# Use npx to run pnpm (avoids PATH issues with global installs)
echo "Installing dependencies..."
npx --yes pnpm@9.15.0 install

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
