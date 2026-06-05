#!/bin/bash
# Inspect evidence URLs for the most recent Beta-sources audit run.
set -e
cd "$(dirname "$0")"

export NPM_CONFIG_YES=true
export CI=1

if [ -f .env.local ]; then
  set -a
  # shellcheck disable=SC1091
  source .env.local
  set +a
fi

# The third audit run id from the previous step.
RUN_ID="3e17e8c9-1892-48b2-bb7c-b53b040c0ad0"

echo "═══════════════════════════════════════════════════════════════"
echo "Evidence-URL audit — run $RUN_ID"
echo "═══════════════════════════════════════════════════════════════"
echo ""

npx tsx scripts/audit-inspect-evidence.ts "$RUN_ID"

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "✓ Wrote outputs/audit-results/${RUN_ID}.evidence.md"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "Press any key to close..."
read -n 1 -s
