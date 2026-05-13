#!/bin/bash
set -e

echo "=== Zeta CAID MCP Server Build ==="
echo "Node: $(node --version)"
echo "npm: $(npm --version)"

# Install pnpm via npx (most reliable on Render)
echo "Installing pnpm..."
npx pnpm@9.15.0 install --ignore-scripts

# Generate Prisma client (skip postinstall, run explicitly)
echo "Generating Prisma client..."
cd packages/db && npx prisma generate && cd ../..

# Build packages in dependency order
echo "Building @zeta/db..."
npx pnpm@9.15.0 --filter @zeta/db run build

echo "Building @zeta/shared..."
npx pnpm@9.15.0 --filter @zeta/shared run build

echo "Building @zeta/types..."
npx pnpm@9.15.0 --filter @zeta/types run build

echo "Building @zeta/mcp-server..."
npx pnpm@9.15.0 --filter @zeta/mcp-server run build

echo "=== Build Complete ==="
