#!/bin/bash

echo "=== Workspace Diagnostic v3 ==="
echo "Node: $(node --version)"
echo "Working dir: $(pwd)"

# Use pnpm if available
if command -v pnpm &> /dev/null; then
  echo "pnpm: $(pnpm --version)"
else
  npm install -g pnpm@9.15.0
fi

pnpm install

echo "=== Workspace packages ==="
pnpm ls --recursive --depth=0 2>&1 | head -50

echo "=== Filter test ==="
echo "Testing: pnpm --filter @zeta/db run build"
pnpm --filter @zeta/db run build
FILTER_EXIT=$?
echo "Filter exit code: $FILTER_EXIT"

echo "=== Done ==="
