#!/bin/bash
#
# Phase Alpha + Beta — local-dev operator setup.
# Run by double-clicking this file in Finder.
#
# Does:
#   1. Phase Alpha migration  (ADD COLUMN × 10 + 2 indexes, additive)
#   2. Phase Beta migration   (CREATE TABLE editorial_voice_signals + 3 indexes)
#   3. Adds KHAT_GUEST_DISCOVERY_V2=1 to .env.local
#   4. Stops any running worker
#   5. Starts a fresh worker in this terminal window so Alpha kicks in
#
# Idempotent. Reversible. Local DB only (localhost:5432).

set -e
cd "$(dirname "$0")"

# Auto-accept any npx interactive prompts (the migration scripts use
# `npx tsx ...` and the first invocation prompts to install tsx).
# Cowork's Terminal is at tier "click" — no typing allowed — so the
# install prompt would block forever without this.
export NPM_CONFIG_YES=true
export CI=1

# Load DATABASE_URL + other secrets from .env.local. `lib/db.ts`
# reads process.env.DATABASE_URL at module-import time; tsx does NOT
# auto-load .env.local. Without this the migration prints
# "db is null — DATABASE_URL not configured" and exits cleanly.
if [ -f .env.local ]; then
  echo "→ Sourcing .env.local for DATABASE_URL"
  set -a
  # shellcheck disable=SC1091
  source .env.local
  set +a
  if [ -n "$DATABASE_URL" ]; then
    # Show the host portion only — never the password.
    masked="$(echo "$DATABASE_URL" | sed -E 's|(postgres(ql)?://[^:@/]+)(:[^@]+)?@|\1@|')"
    echo "  DATABASE_URL = $masked"
  else
    echo "  WARN: DATABASE_URL still empty after sourcing"
  fi
else
  echo "  WARN: .env.local not found at $(pwd)"
fi
echo ""

# Pre-install tsx silently into the local cache so neither migration
# step blocks waiting for the user.
echo "─── Step 0/5 — Pre-warming tsx (npx auto-accept) ──────────────"
npx --yes tsx --version 2>&1 | tail -3
echo ""

echo "═══════════════════════════════════════════════════════════════"
echo "Khat Brain — Phase Alpha + Beta operator setup"
echo "$(date)"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "Working directory: $(pwd)"
echo "Node:              $(node --version 2>/dev/null || echo MISSING)"
echo "npm:               $(npm --version 2>/dev/null || echo MISSING)"
echo ""

# ─── 1. Phase Alpha migration ───────────────────────────────────────
echo "─── Step 1/5 — Phase Alpha migration (ADD COLUMN × 10) ────────"
npm run migrate:phase-alpha-discovery-v2
echo ""

# ─── 2. Phase Beta migration ────────────────────────────────────────
echo "─── Step 2/5 — Phase Beta migration (CREATE TABLE) ────────────"
npm run migrate:phase-beta-voice-signals
echo ""

# ─── 3. Set the feature flag in .env.local ──────────────────────────
echo "─── Step 3/5 — Setting KHAT_GUEST_DISCOVERY_V2=1 ──────────────"
if [ -f .env.local ]; then
  if grep -q "^KHAT_GUEST_DISCOVERY_V2=" .env.local 2>/dev/null; then
    # Replace existing line
    sed -i.bak 's/^KHAT_GUEST_DISCOVERY_V2=.*/KHAT_GUEST_DISCOVERY_V2=1/' .env.local
    echo "   replaced existing KHAT_GUEST_DISCOVERY_V2 line"
  else
    {
      echo ""
      echo "# Phase Alpha + Beta — Guest Discovery v2 (auto-added by run-alpha-beta-setup.command)"
      echo "KHAT_GUEST_DISCOVERY_V2=1"
    } >> .env.local
    echo "   appended KHAT_GUEST_DISCOVERY_V2=1 to .env.local"
  fi
else
  echo "   WARN: .env.local missing — skipping flag set"
fi
echo ""

# ─── 4. Stop existing worker ────────────────────────────────────────
echo "─── Step 4/5 — Restart worker ─────────────────────────────────"
if pgrep -f "tsx lib/jobs/worker.ts" >/dev/null 2>&1; then
  pkill -f "tsx lib/jobs/worker.ts" || true
  echo "   stopped existing worker"
  sleep 2
else
  echo "   no existing worker running"
fi
echo ""

# ─── 5. Start new worker (foreground in this terminal) ──────────────
echo "─── Step 5/5 — Start Alpha worker ─────────────────────────────"
echo ""

# RWA-A3 — CRITICAL FIX. Earlier audit found that appending
# `KHAT_GUEST_DISCOVERY_V2=1` to .env.local was NOT enough: the
# worker (`npx tsx lib/jobs/worker.ts`) does not auto-load .env.local,
# so the env var must be EXPORTED in the current shell before
# `exec npm run worker`. Without this, `alphaFlagEnabled()` returns
# false for every verify_candidate call and the dispatch falls back
# to legacy — exactly what the audit caught.
export KHAT_GUEST_DISCOVERY_V2=1
echo "  exported KHAT_GUEST_DISCOVERY_V2=1 into worker env"
echo ""

echo "═══════════════════════════════════════════════════════════════"
echo "✓ MIGRATIONS APPLIED + ALPHA FLAG SET"
echo ""
echo "  KHAT_GUEST_DISCOVERY_V2 = $KHAT_GUEST_DISCOVERY_V2  (in worker env)"
echo ""
echo "  Starting worker in foreground. KEEP THIS TERMINAL WINDOW OPEN"
echo "  for the worker to keep running."
echo ""
echo "  Press Ctrl+C in this window to stop the worker."
echo "═══════════════════════════════════════════════════════════════"
echo ""

exec npm run worker
