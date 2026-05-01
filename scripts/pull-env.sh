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

# ── gaspar ──────────────────────────────────────────────────────────────────
# Extract DATABASE_URL and write apps/gaspar/.env for local dev.
GASPAR_ENV="$REPO_ROOT/apps/gaspar/.env"
DATABASE_URL=$(grep '^DATABASE_URL=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"')

if [ -n "$DATABASE_URL" ]; then
  printf 'DATABASE_URL="%s"\nPORT=3000\n' "$DATABASE_URL" > "$GASPAR_ENV"
  echo "✓ Wrote apps/gaspar/.env"
else
  echo "⚠ DATABASE_URL not found in .env.local — apps/gaspar/.env not updated"
fi

# ── worfbot-gateway ──────────────────────────────────────────────────────────
# Discord tokens live in the shell environment (e.g. ~/.zshrc), not Vercel.
# Write them into apps/worfbot-gateway/.env so `node dist/main.js` picks them up.
WORFBOT_ENV="$REPO_ROOT/apps/worfbot-gateway/.env"
{
  printf 'SKIP_RATE_LIMIT="true"\n'
  printf 'HEALTH_PORT=3001\n'
  for var in DISCORD_BOT_TOKEN DISCORD_APP_ID DISCORD_PUBLIC_KEY; do
    val="${!var:-}"
    if [ -n "$val" ]; then
      printf '%s="%s"\n' "$var" "$val"
    else
      printf '# %s=""  # not found in environment — set in ~/.zshrc\n' "$var"
    fi
  done
} > "$WORFBOT_ENV"
echo "✓ Wrote apps/worfbot-gateway/.env"
