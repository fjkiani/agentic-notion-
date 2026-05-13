#!/bin/bash
set -e
echo "=== Zeta CAID MCP Server Build ==="
node --version
npm --version

# Install pnpm globally first (caches it for npx)
echo "Installing pnpm globally..."
npm install -g pnpm@9.15.0 || echo "Global install failed, continuing..."

# Use npx to run pnpm (works even if global install failed)
echo "Installing dependencies..."
npx pnpm@9.15.0 install
echo "pnpm install done"

# Generate Prisma client
echo "Generating Prisma client..."
npx pnpm@9.15.0 exec prisma generate --schema=packages/db/prisma/schema.prisma
echo "Prisma generate done"

# Build @zeta/db
echo "Building @zeta/db..."
cd packages/db
../../node_modules/.bin/tsc
echo "@zeta/db built"
cd ../..

# Copy generated client to dist/
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
