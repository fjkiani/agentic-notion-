#!/bin/bash
set -e

echo "Step 1: Install pnpm"
npm install -g pnpm@9.15.0
echo "pnpm: $(pnpm --version)"

echo "Step 2: pnpm install"
pnpm install

echo "Step 3: Check workspace"
pnpm ls --depth=0 2>&1 | head -20 || echo "pnpm ls failed"

echo "Step 4: Build @zeta/db (cd approach)"
cd packages/db
tsc --version || echo "no tsc in packages/db"
../../node_modules/.bin/tsc || npx tsc
cd ../..
echo "db build OK"

echo "BUILD SCRIPT COMPLETE"
