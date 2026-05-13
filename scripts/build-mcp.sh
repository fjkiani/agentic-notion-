#!/bin/bash
set -e

echo "=== Diagnostic Build Script ==="
echo "Node: $(node --version)"
echo "Working dir: $(pwd)"
echo "Files: $(ls)"

# Use pnpm if available, otherwise install
if command -v pnpm &> /dev/null; then
  echo "pnpm available: $(pnpm --version)"
else
  echo "Installing pnpm..."
  npm install -g pnpm@9.15.0
fi

# Install workspace dependencies
echo "Running pnpm install..."
pnpm install

echo "=== Workspace check ==="
echo "pnpm-workspace.yaml:"
cat pnpm-workspace.yaml

echo "pnpm ls --recursive:"
pnpm ls --depth=0 --recursive 2>&1 | head -30

echo "=== Testing filter ==="
echo "Testing pnpm --filter @zeta/db run build..."
pnpm --filter @zeta/db run build 2>&1
echo "Exit code: $?"

echo "BUILD SCRIPT REACHED END"
