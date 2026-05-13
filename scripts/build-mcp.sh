#!/bin/bash
set -e
echo "=== Zeta CAID MCP Server Build ==="
node --version
npm --version

# Install pnpm
npm install -g pnpm@9.15.0
export PATH="$(npm config get prefix)/bin:$PATH"
pnpm --version

# Install dependencies
echo "Running pnpm install..."
pnpm install
echo "pnpm install done"

# Build @zeta/db
echo "Building @zeta/db..."
cd packages/db
../../node_modules/.bin/tsc
echo "@zeta/db built"
cd ../..

echo "Copying generated client..."
mkdir -p packages/db/dist/generated/client
cp -r packages/db/src/generated/client/* packages/db/dist/generated/client/

echo "Building @zeta/shared..."
cd packages/shared && ../../node_modules/.bin/tsc && cd ../..

echo "Building @zeta/types..."
cd packages/types && ../../node_modules/.bin/tsc && cd ../..

echo "Building @zeta/mcp-server..."
cd apps/mcp-server && ../../node_modules/.bin/tsc && cd ../..

echo "=== Build Complete ==="
ls apps/mcp-server/dist/
