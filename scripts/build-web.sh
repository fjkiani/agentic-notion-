#!/bin/bash
set -euo pipefail

echo "=== Zeta CAID Web Build ==="
echo "Node: $(node --version)"
echo "pnpm: $(pnpm --version 2>/dev/null || echo 'not found')"
echo "PWD: $(pwd)"
echo "DATE: $(date -u)"

export NODE_ENV=production

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
echo "=== Step 5: Prisma db push ==="
# Only run db:push if DATABASE_URL is accessible (external URL)
# Internal Render URLs (dpg-*) are not accessible from the build environment
DB_URL="${DATABASE_URL:-}"
if [[ "$DB_URL" == *".oregon-postgres.render.com"* ]] || [[ "$DB_URL" == *"localhost"* ]]; then
  echo "Running db:push (external/local URL detected)..."
  pnpm --filter @zeta/db run db:push
  echo "✓ Prisma db push done"
else
  echo "Skipping db:push (internal Render URL — not accessible from build env)"
  echo "Tables will be created/migrated at service startup"
fi

echo ""
echo "=== Step 6: Building Next.js web app ==="
pnpm --filter @zeta/web run build
echo "✓ Next.js build done"

echo ""
echo "=== Build Complete ==="
ls apps/web/.next/ 2>/dev/null || echo "WARNING: .next directory not found"
