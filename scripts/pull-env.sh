#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$REPO_ROOT/.env.local"
TMP_ENV_FILE="$REPO_ROOT/.env.local.tmp"

if ! command -v vercel &>/dev/null; then
  echo "⚠ vercel CLI not found. Install it with: pnpm add -g vercel"
  exit 1
fi

# Pull from the portfolio Vercel project (where the link lives) to repo root
vercel env pull "$TMP_ENV_FILE" --yes --cwd "$REPO_ROOT/apps/portfolio" 2>/dev/null

if [ ! -f "$ENV_FILE" ]; then
  mv "$TMP_ENV_FILE" "$ENV_FILE"
  echo "✓ Pulled env vars to .env.local"
elif diff -q "$ENV_FILE" "$TMP_ENV_FILE" &>/dev/null; then
  rm "$TMP_ENV_FILE"
  echo "✓ .env.local is already up to date"
else
  mv "$TMP_ENV_FILE" "$ENV_FILE"
  echo "✓ .env.local updated with latest env vars"
fi
