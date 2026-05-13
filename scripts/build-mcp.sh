#!/bin/bash
set -e

echo "=== Zeta CAID MCP Server Build ==="
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

echo "After install, checking workspace..."
pnpm ls --depth=0 2>&1 | head -30 || echo "pnpm ls failed with $?"

echo "Checking pnpm-workspace.yaml..."
cat pnpm-workspace.yaml || echo "no pnpm-workspace.yaml"

echo "Checking packages..."
ls packages/ || echo "no packages dir"
ls apps/ || echo "no apps dir"

echo "BUILD SCRIPT REACHED END"
