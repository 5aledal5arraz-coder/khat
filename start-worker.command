#!/bin/bash
#
# Start the Khat Brain jobs worker — run by DOUBLE-CLICKING in Finder.
#
# Cowork's Terminal is tier "click" (no typing), so this double-click
# launcher is how the worker gets started. It mirrors `npm run worker`
# but first sources .env.local (tsx does NOT auto-load it) so
# DATABASE_URL + feature flags are present, and pre-warms tsx so the
# npx install prompt can't block.
#
# Keep this window OPEN for the worker to keep running. Ctrl+C to stop.
# Safe to delete this file afterward.

cd "$(dirname "$0")"

# Auto-accept npx prompts (no typing possible in this terminal).
export NPM_CONFIG_YES=true
export CI=1

# Load DATABASE_URL + flags from .env.local into the exported env so
# `npm run worker` (npx tsx lib/jobs/worker.ts) inherits them.
if [ -f .env.local ]; then
  echo "→ Sourcing .env.local"
  set -a
  # shellcheck disable=SC1091
  source .env.local
  set +a
  if [ -n "$DATABASE_URL" ]; then
    masked="$(echo "$DATABASE_URL" | sed -E 's|(postgres(ql)?://[^:@/]+)(:[^@]+)?@|\1@|')"
    echo "  DATABASE_URL = $masked"
  else
    echo "  WARN: DATABASE_URL empty after sourcing .env.local"
  fi
else
  echo "  WARN: .env.local not found at $(pwd)"
fi
echo ""

echo "→ Pre-warming tsx (auto-accept)…"
npx --yes tsx --version >/dev/null 2>&1 || true

# Stop any stale worker so we don't run two.
if pgrep -f "tsx lib/jobs/worker.ts" >/dev/null 2>&1; then
  echo "→ Stopping existing worker…"
  pkill -f "tsx lib/jobs/worker.ts" 2>/dev/null || true
  sleep 2
fi

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "  Starting Khat Brain worker — KEEP THIS WINDOW OPEN."
echo "  Node: $(node --version 2>/dev/null || echo MISSING)  npm: $(npm --version 2>/dev/null || echo MISSING)"
echo "  $(date)"
echo "════════════════════════════════════════════════════════════════"
echo ""

exec npm run worker
