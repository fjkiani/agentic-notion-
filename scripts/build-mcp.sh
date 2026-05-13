#!/bin/bash
set -e
echo "=== Zeta CAID MCP Server Build ==="
node --version
npm --version

# Install pnpm globally
echo "Installing pnpm..."
npm install -g pnpm@9.15.0

# Find pnpm binary - try multiple locations
PNPM_BIN=""
for dir in /usr/local/bin /usr/bin ~/.npm-global/bin; do
  if [ -f "$dir/pnpm" ]; then
    PNPM_BIN="$dir/pnpm"
    echo "Found pnpm at: $PNPM_BIN"
    break
  fi
done

if [ -z "$PNPM_BIN" ]; then
  echo "pnpm not found in standard locations, using npx..."
  PNPM_BIN="npx --yes pnpm@9.15.0"
fi

echo "Using: $PNPM_BIN"
$PNPM_BIN --version

# Install dependencies
echo "Running pnpm install..."
$PNPM_BIN install
echo "pnpm install done"

# Generate Prisma client (downloads query engine binary for Render)
echo "Generating Prisma client..."
$PNPM_BIN exec prisma generate --schema=packages/db/prisma/schema.prisma
echo "Prisma generate done"

# Build @zeta/db
echo "Building @zeta/db..."
cd packages/db
../../node_modules/.bin/tsc
echo "@zeta/db built"
cd ../..

# Copy generated client to dist/ (includes .node binary)
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
