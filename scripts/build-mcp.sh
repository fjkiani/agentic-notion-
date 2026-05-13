#!/bin/bash
# Don't use set -e here to avoid early exit
echo "=== Zeta CAID MCP Server Build ==="

# Check what's available
which node && node --version || echo "node not found"
which npm && npm --version || echo "npm not found"
which npx && npx --version || echo "npx not found"

# Install pnpm
npm install -g pnpm@9.15.0
which pnpm && pnpm --version || echo "pnpm not found after install"

# Try to find pnpm
ls -la $(npm config get prefix)/bin/ 2>/dev/null || echo "npm prefix bin not found"

# Add npm prefix to PATH
export PATH="$(npm config get prefix)/bin:$PATH"
which pnpm && pnpm --version || echo "pnpm still not found"

# Install dependencies
pnpm install --frozen-lockfile

# Build
cd packages/db && ../../node_modules/.bin/tsc && cd ../..
mkdir -p packages/db/dist/generated/client
cp -r packages/db/src/generated/client/* packages/db/dist/generated/client/
cd packages/shared && ../../node_modules/.bin/tsc && cd ../..
cd packages/types && ../../node_modules/.bin/tsc && cd ../..
cd apps/mcp-server && ../../node_modules/.bin/tsc && cd ../..

echo "=== Build Complete ==="
ls apps/mcp-server/dist/
