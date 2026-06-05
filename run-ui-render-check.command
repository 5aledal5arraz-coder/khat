#!/bin/bash
# UI render check — flip one Alpha-tagged candidate to "proposed",
# open Chrome to /admin/discovery so the card is visible, wait 30
# seconds for screenshot capture, then revert.
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

echo "═══════════════════════════════════════════════════════════════"
echo "UI render check — Alpha card on real data"
echo "═══════════════════════════════════════════════════════════════"
echo ""

echo "→ Step 1/3 — promote one Alpha-tagged candidate"
npx tsx scripts/audit-ui-promote-then-revert.ts promote
echo ""

echo "→ Step 2/3 — open Chrome at /admin/discovery"
open -a "Google Chrome" "http://localhost:3000/admin/discovery"
echo ""
echo "   Waiting 30 seconds so the page can render + be screenshotted…"
sleep 30
echo ""

echo "→ Step 3/3 — revert the candidate back to 'rejected'"
npx tsx scripts/audit-ui-promote-then-revert.ts revert
echo ""

echo "═══════════════════════════════════════════════════════════════"
echo "✓ UI render check complete. Database state restored."
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "Press any key to close..."
read -n 1 -s
