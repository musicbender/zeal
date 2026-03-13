#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$APP_DIR/.env.development.local"
TMP_ENV_FILE="$APP_DIR/.env.development.local.tmp"

# Check vercel CLI is installed
if ! command -v vercel &>/dev/null; then
  echo "⚠ vercel CLI not found. Install it with: pnpm add -g vercel"
  echo "  Skipping env pull. If you have a .env file already, dev will still work."
  exit 0
fi

# Pull to a temp file and compare
vercel env pull "$TMP_ENV_FILE" --yes 2>/dev/null

if [ ! -f "$ENV_FILE" ]; then
  mv "$TMP_ENV_FILE" "$ENV_FILE"
  echo "✓ Pulled env vars to .env.development.local"
elif diff -q "$ENV_FILE" "$TMP_ENV_FILE" &>/dev/null; then
  rm "$TMP_ENV_FILE"
  echo "✓ .env.development.local is already up to date"
else
  mv "$TMP_ENV_FILE" "$ENV_FILE"
  echo "✓ .env.development.local updated with latest env vars"
fi
