#!/bin/bash
set -e

echo "=== Zeta CAID Web Build ==="
echo "Node: $(node --version)"

echo "Installing pnpm..."
npx pnpm@9.15.0 install --ignore-scripts

echo "Generating Prisma client..."
cd packages/db && npx prisma generate && cd ../..

echo "Building @zeta/db..."
npx pnpm@9.15.0 --filter @zeta/db run build

echo "Building @zeta/shared..."
npx pnpm@9.15.0 --filter @zeta/shared run build

echo "Building @zeta/types..."
npx pnpm@9.15.0 --filter @zeta/types run build

echo "Building @zeta/web..."
npx pnpm@9.15.0 --filter @zeta/web run build

echo "=== Build Complete ==="
