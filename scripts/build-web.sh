#!/bin/bash
set -euo pipefail

echo "=== Zeta CAID Web Build ==="
node --version
pnpm --version

export NODE_ENV=production

echo "Installing dependencies..."
pnpm install --frozen-lockfile --prod=false
echo "pnpm install done"

echo "Building packages..."
pnpm --filter @zeta/db run build
pnpm --filter @zeta/shared run build
pnpm --filter @zeta/types run build

echo "Pushing Prisma schema to database..."
cd packages/db && npx prisma db push --skip-generate --accept-data-loss && cd ../..
echo "Prisma db push done"

pnpm --filter @zeta/web run build

echo "=== Build Complete ==="
ls apps/web/.next/
