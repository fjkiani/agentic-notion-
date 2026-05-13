#!/bin/bash
set -e
echo "=== Zeta CAID Agent API Build ==="
node --version
npm --version
pnpm --version

# Install dependencies
echo "Installing dependencies..."
pnpm install
echo "pnpm install done"

echo "Skipping prisma generate (binary is pre-committed to repo)"

# Build @zeta/db
echo "Building @zeta/db..."
cd packages/db && ../../node_modules/.bin/tsc && cd ../..

# Copy generated client to dist/ (includes pre-committed .node binary)
echo "Copying generated client..."
mkdir -p packages/db/dist/generated/client
cp -r packages/db/src/generated/client/* packages/db/dist/generated/client/
echo "Generated client copied (including .node binary)"

echo "Building @zeta/shared..."
cd packages/shared && ../../node_modules/.bin/tsc && cd ../..

echo "Building @zeta/types..."
cd packages/types && ../../node_modules/.bin/tsc && cd ../..

echo "Building @zeta/agent-api..."
cd apps/agent-api && ../../node_modules/.bin/tsc && cd ../..

echo "=== Build Complete ==="
ls apps/agent-api/dist/
