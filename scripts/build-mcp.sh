#!/bin/bash
set -e

echo "Step 1: Install pnpm"
npm install -g pnpm@9.15.0
echo "pnpm: $(pnpm --version)"

echo "Step 2: pnpm install"
pnpm install

echo "Step 3: Check pnpm still works"
pnpm --version

echo "Step 4: Build @zeta/db"
pnpm --filter @zeta/db run build
echo "db build OK"

echo "BUILD SCRIPT COMPLETE"
