#!/bin/bash
set -e

echo "Step 1: Node version"
node --version

echo "Step 2: npm version"
npm --version

echo "Step 3: Install pnpm"
npm install -g pnpm@9.15.0
echo "pnpm: $(pnpm --version)"

echo "Step 4: pnpm install"
pnpm install

echo "Step 5: Check pnpm still works"
pnpm --version

echo "Step 6: List node_modules/.bin"
ls node_modules/.bin/ | head -20

echo "BUILD SCRIPT COMPLETE"
