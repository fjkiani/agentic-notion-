#!/bin/bash
echo "=== Zeta CAID MCP Server Build ==="
node --version
npm --version

# Install pnpm
npm install -g pnpm@9.15.0
export PATH="$(npm config get prefix)/bin:$PATH"
pnpm --version

# Install dependencies
pnpm install

# Build
cd packages/db && ../../node_modules/.bin/tsc && cd ../..
mkdir -p packages/db/dist/generated/client
cp -r packages/db/src/generated/client/* packages/db/dist/generated/client/
cd packages/shared && ../../node_modules/.bin/tsc && cd ../..
cd packages/types && ../../node_modules/.bin/tsc && cd ../..
cd apps/mcp-server && ../../node_modules/.bin/tsc && cd ../..

echo "=== Build Complete ==="
ls apps/mcp-server/dist/
