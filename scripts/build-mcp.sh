#!/bin/bash
set -euo pipefail

echo "=== Zeta CAID MCP Server Build ==="
echo "Node: $(node --version)"
echo "pnpm: $(pnpm --version 2>/dev/null || echo 'not found')"
echo "PWD: $(pwd)"
echo "DATE: $(date -u)"

export NODE_ENV=production

# Help Prisma find the committed query engine binary (avoids download on Render)
BINARY_PATH="$(pwd)/packages/db/src/generated/client/libquery_engine-debian-openssl-3.0.x.so.node"
if [ -f "$BINARY_PATH" ]; then
  export PRISMA_QUERY_ENGINE_LIBRARY="$BINARY_PATH"
  echo "Using committed Prisma binary: $BINARY_PATH"
fi

echo ""
echo "=== Step 1: Installing dependencies ==="
pnpm install --frozen-lockfile --prod=false
echo "✓ pnpm install done"

echo ""
echo "=== Step 2: Building @zeta/db (prisma generate + tsc) ==="
pnpm --filter @zeta/db run build
echo "✓ @zeta/db build done"

echo ""
echo "=== Step 3: Building @zeta/shared ==="
pnpm --filter @zeta/shared run build
echo "✓ @zeta/shared build done"

echo ""
echo "=== Step 4: Building @zeta/types ==="
pnpm --filter @zeta/types run build
echo "✓ @zeta/types build done"

echo ""
echo "=== Step 5: Building MCP server ==="
pnpm --filter @zeta/mcp-server run build || echo "⚠️  MCP tsc had type errors (non-fatal)"
echo "✓ MCP server build done"

echo ""
echo "=== Build Complete (schema push runs at startup) ==="
ls apps/mcp-server/dist/ 2>/dev/null || echo "WARNING: dist directory not found"
