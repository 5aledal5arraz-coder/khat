#!/bin/bash
# Wave 5: admin pages render test
set -u
BASE="http://localhost:3000"
OWNER=$(python3 -c "import json; print(json.load(open('/tmp/khat-uat-owner.json'))['token'])")
COOKIE="__admin_session=$OWNER"

PASS=0
FAIL=0

echo "=== WAVE 5: Admin pages render (OWNER) ==="
for path in /admin /admin/episodes /admin/guests /admin/submissions /admin/studio /admin/newsletter /admin/settings /admin/audio-platforms /admin/analytics /admin/team; do
  code=$(curl -s -o /dev/null -w "%{http_code}" -H "Cookie: $COOKIE" "$BASE$path")
  if [ "$code" = "200" ]; then
    PASS=$((PASS+1))
    echo "PASS - GET $path :: HTTP $code"
  else
    FAIL=$((FAIL+1))
    echo "FAIL - GET $path :: HTTP $code"
  fi
done

echo ""
echo "=== WAVE 5: Public pages render ==="
for path in / /episodes /guests /about /contact /sponsor /guest /listen /more; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$path")
  if [ "$code" = "200" ]; then
    PASS=$((PASS+1))
    echo "PASS - GET $path :: HTTP $code"
  else
    FAIL=$((FAIL+1))
    echo "FAIL - GET $path :: HTTP $code"
  fi
done

echo ""
echo "=== WAVE 5: Real episode + guest slug ==="
# Grab first published episode from DB via API
curl -s "$BASE/api/episodes?limit=1" -o /tmp/ep1.json
EP_SLUG=$(python3 -c "import json; d=json.load(open('/tmp/ep1.json')); eps=d if isinstance(d,list) else d.get('episodes',[]); print(eps[0]['slug'] if eps else '')" 2>/dev/null)
if [ -n "$EP_SLUG" ]; then
  code=$(curl -s -o /tmp/ep-page.html -w "%{http_code}" "$BASE/episodes/$EP_SLUG")
  if [ "$code" = "200" ]; then
    PASS=$((PASS+1))
    echo "PASS - GET /episodes/$EP_SLUG :: HTTP $code"
  else
    FAIL=$((FAIL+1))
    echo "FAIL - GET /episodes/$EP_SLUG :: HTTP $code"
  fi
  # Check JSON-LD
  if grep -q "application/ld+json" /tmp/ep-page.html; then
    PASS=$((PASS+1))
    echo "PASS - episode page has JSON-LD"
  else
    FAIL=$((FAIL+1))
    echo "FAIL - episode page has JSON-LD"
  fi
  if grep -q '"@type":"VideoObject"' /tmp/ep-page.html; then
    PASS=$((PASS+1))
    echo "PASS - episode page has VideoObject schema"
  else
    FAIL=$((FAIL+1))
    echo "FAIL - episode page has VideoObject schema"
  fi
fi

# Homepage JSON-LD
curl -s "$BASE/" -o /tmp/home.html
if grep -q "application/ld+json" /tmp/home.html; then
  PASS=$((PASS+1))
  echo "PASS - homepage has JSON-LD"
else
  FAIL=$((FAIL+1))
  echo "FAIL - homepage has JSON-LD"
fi

echo ""
echo "=== WAVE 5 SUMMARY: $PASS passed, $FAIL failed ==="
if [ $FAIL -gt 0 ]; then exit 1; fi
exit 0
