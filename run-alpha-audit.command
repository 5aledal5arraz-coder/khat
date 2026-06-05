#!/bin/bash
#
# Real-world audit — Alpha pipeline end-to-end.
#
# 1. Sources .env.local so DATABASE_URL is set
# 2. Triggers a real Alpha-mode discovery run against EIR
#    f1c501f5-fd57-49b8-97bb-d3876b67ed82 (Operator Day #2 era)
# 3. Polls until the worker completes (or 4-minute timeout)
# 4. Writes outputs/audit-results/<run_id>.{json,md}
#
# Requires:
#  - The Alpha worker is running (started by run-alpha-beta-setup.command)
#  - The migrations are applied
#  - DATABASE_URL points at local Postgres

set -e
cd "$(dirname "$0")"

export NPM_CONFIG_YES=true
export CI=1

echo "═══════════════════════════════════════════════════════════════"
echo "Real-world audit — Alpha pipeline end-to-end"
echo "$(date)"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# ─── Source .env.local ──────────────────────────────────────────────
if [ -f .env.local ]; then
  set -a
  # shellcheck disable=SC1091
  source .env.local
  set +a
  if [ -z "$DATABASE_URL" ]; then
    echo "ERROR: DATABASE_URL still empty after sourcing .env.local"
    exit 1
  fi
  if [ -z "$KHAT_GUEST_DISCOVERY_V2" ] || [ "$KHAT_GUEST_DISCOVERY_V2" != "1" ]; then
    echo "WARN: KHAT_GUEST_DISCOVERY_V2 is not '1' — Alpha dispatch will NOT fire."
    echo "      Run run-alpha-beta-setup.command first."
  fi
else
  echo "ERROR: .env.local missing"
  exit 1
fi

# ─── 1. Trigger ─────────────────────────────────────────────────────
echo "─── Step 1/2 — Trigger Alpha discovery run ────────────────────"
TRIGGER_OUT="$(npm run audit:trigger-alpha 2>&1)"
echo "$TRIGGER_OUT"

# Extract the AUDIT_RUN_ID= line
RUN_ID="$(echo "$TRIGGER_OUT" | grep -E '^AUDIT_RUN_ID=' | head -1 | sed -E 's/^AUDIT_RUN_ID=//')"
if [ -z "$RUN_ID" ]; then
  echo ""
  echo "ERROR: could not extract AUDIT_RUN_ID from trigger output"
  exit 2
fi

echo ""
echo "Triggered run: $RUN_ID"
echo ""

# Brief pause to let the worker pick up the seed_archetypes job
sleep 3

# ─── 2. Inspect ─────────────────────────────────────────────────────
echo "─── Step 2/2 — Inspect run + write audit report ───────────────"
npm run audit:inspect-alpha -- "$RUN_ID"
INSPECT_EXIT=$?

echo ""
echo "═══════════════════════════════════════════════════════════════"
if [ $INSPECT_EXIT -eq 0 ]; then
  echo "✓ AUDIT COMPLETE — see outputs/audit-results/${RUN_ID}.md"
else
  echo "✗ AUDIT FAILED (exit $INSPECT_EXIT) — see output above + outputs/audit-results/${RUN_ID}.md"
fi
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "Press any key to close this window..."
read -n 1 -s
