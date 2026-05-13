#!/bin/bash
set -e

echo "=== Zeta CAID MCP Server Build ==="
echo "Node: $(node --version)"
echo "npm: $(npm --version)"
echo "Working dir: $(pwd)"
echo "Files: $(ls | head -10)"

# Try to use pnpm if already available
if command -v pnpm &> /dev/null; then
  echo "pnpm already available: $(pnpm --version)"
else
  echo "Installing pnpm via npm..."
  npm install -g pnpm@9.15.0 2>&1
  echo "npm install exit code: $?"
fi

echo "pnpm version: $(pnpm --version 2>&1 || echo 'pnpm not found')"

# Install workspace dependencies
echo "Running pnpm install..."
pnpm install 2>&1
echo "pnpm install exit code: $?"

echo "BUILD SCRIPT REACHED END"
