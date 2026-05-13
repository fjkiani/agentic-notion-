#!/bin/bash
set -e

echo "=== Filter Test ==="
echo "Node: $(node --version)"

# Use pnpm if available
if command -v pnpm &> /dev/null; then
  echo "pnpm: $(pnpm --version)"
else
  npm install -g pnpm@9.15.0
fi

pnpm install

echo "Testing different filter syntaxes..."
echo "1. pnpm --filter @zeta/db run build"
pnpm --filter @zeta/db run build && echo "SYNTAX 1 OK" || echo "SYNTAX 1 FAILED with $?"

echo "BUILD SCRIPT REACHED END"
