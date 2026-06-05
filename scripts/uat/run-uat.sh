#!/bin/bash
# Real execution UAT for KHAT pre-launch
# Runs against http://localhost:3000 with a DB-created admin session
set -u
BASE="http://localhost:3000"
OWNER=$(cat /tmp/khat-uat-owner.json | python3 -c "import json,sys; print(json.load(sys.stdin)['token'])")
EDITOR=$(cat /tmp/khat-uat-editor.json | python3 -c "import json,sys; print(json.load(sys.stdin)['token'])")
OWNER_COOKIE="__admin_session=$OWNER"
EDITOR_COOKIE="__admin_session=$EDITOR"

PASS=0
FAIL=0
RESULTS=()

log() { echo "[$(date +%H:%M:%S)] $*"; }
record() {
  local name="$1"; local status="$2"; local detail="$3"
  if [ "$status" = "PASS" ]; then PASS=$((PASS+1)); else FAIL=$((FAIL+1)); fi
  RESULTS+=("$status | $name | $detail")
  log "$status - $name :: $detail"
}

check_http() {
  local name="$1"; local expected="$2"; local got="$3"; local body="$4"
  if [ "$got" = "$expected" ]; then
    record "$name" "PASS" "HTTP $got"
  else
    record "$name" "FAIL" "expected HTTP $expected got $got body=${body:0:120}"
  fi
}

# ============================================================
# Section A — Public page rendering
# ============================================================
log "=== A. PUBLIC PAGES ==="

for path in "/" "/episodes" "/guests" "/listen" "/contact" "/more" "/guest" "/sponsor" "/sitemap.xml"; do
  code=$(curl -s -o /tmp/page-body.html -w "%{http_code}" "$BASE$path" --max-time 30)
  check_http "GET $path" "200" "$code" "$(head -c 80 /tmp/page-body.html)"
done

# Verify JSON-LD on homepage
curl -s "$BASE/" --max-time 20 > /tmp/home.html
if grep -q 'application/ld+json' /tmp/home.html && grep -q '"PodcastSeries"' /tmp/home.html; then
  record "Homepage JSON-LD contains PodcastSeries" "PASS" "present"
else
  record "Homepage JSON-LD contains PodcastSeries" "FAIL" "missing"
fi
if grep -q '"Organization"' /tmp/home.html && grep -q '"WebSite"' /tmp/home.html; then
  record "Homepage JSON-LD contains Organization+WebSite" "PASS" "present"
else
  record "Homepage JSON-LD contains Organization+WebSite" "FAIL" "missing"
fi

# Verify sitemap contains /listen
if curl -s "$BASE/sitemap.xml" --max-time 20 | grep -q "/listen"; then
  record "Sitemap contains /listen" "PASS" "found"
else
  record "Sitemap contains /listen" "FAIL" "missing"
fi

# Verify noindex on private pages
for p in "/prepare/invalid-token-xyz" "/candidate-prep/invalid-token-xyz"; do
  curl -s "$BASE$p" --max-time 20 > /tmp/noidx.html
  if grep -qi 'noindex' /tmp/noidx.html; then
    record "Noindex present on $p" "PASS" "meta found"
  else
    record "Noindex present on $p" "FAIL" "not found"
  fi
done

# ============================================================
# Section B — Public forms (real HTTP through full pipeline)
# ============================================================
log "=== B. PUBLIC FORMS ==="

# B1: Newsletter subscribe (valid)
UNIQUE_EMAIL="uat-news-$(date +%s)@khat.test"
code=$(curl -s -o /tmp/news.json -w "%{http_code}" \
  -X POST "$BASE/api/newsletter" \
  -H "Content-Type: application/json" \
  -H "Origin: $BASE" \
  -H "x-requested-with: khat" \
  -d "{\"email\":\"$UNIQUE_EMAIL\"}" --max-time 20)
check_http "POST /api/newsletter (valid email)" "200" "$code" "$(cat /tmp/news.json)"

# B2: Newsletter with invalid email
code=$(curl -s -o /tmp/news-bad.json -w "%{http_code}" \
  -X POST "$BASE/api/newsletter" \
  -H "Content-Type: application/json" \
  -H "Origin: $BASE" \
  -H "x-requested-with: khat" \
  -d '{"email":"not-an-email"}' --max-time 20)
check_http "POST /api/newsletter (invalid)" "400" "$code" "$(cat /tmp/news-bad.json)"

# B3: Newsletter with missing CSRF header
code=$(curl -s -o /tmp/news-nocsrf.json -w "%{http_code}" \
  -X POST "$BASE/api/newsletter" \
  -H "Content-Type: application/json" \
  -H "Origin: $BASE" \
  -d "{\"email\":\"test2-$(date +%s)@khat.test\"}" --max-time 20)
check_http "POST /api/newsletter (missing x-requested-with)" "403" "$code" "$(cat /tmp/news-nocsrf.json)"

# B4: Sponsor form valid
SPONSOR_EMAIL="uat-sponsor-$(date +%s)@khat.test"
SPONSOR_COMPANY="UAT Test Co $(date +%s)"
code=$(curl -s -o /tmp/sponsor.json -w "%{http_code}" \
  -X POST "$BASE/api/sponsor" \
  -H "Content-Type: application/json" \
  -H "Origin: $BASE" \
  -H "x-requested-with: khat" \
  -d "{
    \"company_name\":\"$SPONSOR_COMPANY\",
    \"industry\":\"tech\",
    \"contact_name\":\"UAT Tester\",
    \"job_title\":\"QA\",
    \"email\":\"$SPONSOR_EMAIL\",
    \"phone\":\"+96500000000\",
    \"collaboration_types\":[\"episode_sponsor\"],
    \"main_goal\":\"brand_awareness\",
    \"target_audience\":\"tech audience\",
    \"budget_range\":\"1000-5000\"
  }" --max-time 30)
check_http "POST /api/sponsor (valid)" "200" "$code" "$(cat /tmp/sponsor.json)"

# B5: Sponsor form missing fields
code=$(curl -s -o /tmp/sponsor-bad.json -w "%{http_code}" \
  -X POST "$BASE/api/sponsor" \
  -H "Content-Type: application/json" \
  -H "Origin: $BASE" \
  -H "x-requested-with: khat" \
  -d '{"company_name":""}' --max-time 20)
check_http "POST /api/sponsor (missing fields)" "400" "$code" "$(cat /tmp/sponsor-bad.json)"

# B6: Guest application valid
GUEST_EMAIL="uat-guest-$(date +%s)@khat.test"
code=$(curl -s -o /tmp/ga.json -w "%{http_code}" \
  -X POST "$BASE/api/guest-application" \
  -H "Content-Type: application/json" \
  -H "Origin: $BASE" \
  -H "x-requested-with: khat" \
  -d "{
    \"name\":\"UAT Guest\",
    \"email\":\"$GUEST_EMAIL\",
    \"phone\":\"+96500000000\",
    \"country\":\"الكويت\",
    \"story_idea\":\"This is a UAT test story idea with enough length\",
    \"beyond_job_title\":\"I am a tester\",
    \"life_changing_moment\":\"Writing UAT scripts\",
    \"hope_people_understand\":\"Testing matters\",
    \"unasked_question\":\"What is automated testing?\",
    \"why_khat\":\"It is a great podcast\",
    \"previous_podcast\":false,
    \"prefer_dialogue_or_story\":\"dialogue\",
    \"filming_concern\":\"no\",
    \"agrees_to_publish\":true
  }" --max-time 30)
check_http "POST /api/guest-application (valid)" "200" "$code" "$(cat /tmp/ga.json)"

# ============================================================
# Section C — Admin API auth
# ============================================================
log "=== C. ADMIN AUTH ==="

# C1: Authenticated list guests
code=$(curl -s -o /tmp/g-list.json -w "%{http_code}" \
  -H "Cookie: $OWNER_COOKIE" \
  "$BASE/api/admin/guests" --max-time 20)
check_http "OWNER GET /api/admin/guests" "200" "$code" ""

# C2: Unauth list guests (no cookie)
code=$(curl -s -o /tmp/g-noauth.json -w "%{http_code}" \
  "$BASE/api/admin/guests" --max-time 20)
check_http "No-cookie GET /api/admin/guests" "401" "$code" ""

# C3: EDITOR hitting ADMIN-gated newsletter send
code=$(curl -s -o /tmp/news-send.json -w "%{http_code}" \
  -X POST "$BASE/api/admin/newsletter/send" \
  -H "Cookie: $EDITOR_COOKIE" \
  -H "Content-Type: application/json" \
  -d '{"subject":"uat","body":"uat"}' --max-time 20)
check_http "EDITOR POST /api/admin/newsletter/send" "403" "$code" "$(cat /tmp/news-send.json)"

# C4: OWNER hitting newsletter send (but we do not want to actually send — expect it to try)
# Since we may have 1 subscriber we created, this WOULD really send. We only test auth gate.
# Skip actual send; already tested role gate.

# ============================================================
# Section D — Admin CRUD (guests)
# ============================================================
log "=== D. ADMIN GUEST CRUD ==="

# D1: Create guest
GUEST_NAME="UAT Test Guest $(date +%s)"
code=$(curl -s -o /tmp/g-create.json -w "%{http_code}" \
  -X POST "$BASE/api/admin/guests" \
  -H "Cookie: $OWNER_COOKIE" \
  -H "Content-Type: application/json" \
  -H "Origin: $BASE" \
  -H "x-requested-with: khat" \
  -d "{\"name\":\"$GUEST_NAME\",\"bio\":\"UAT bio\"}" --max-time 20)
check_http "POST /api/admin/guests (create)" "200" "$code" "$(head -c 120 /tmp/g-create.json)"
NEW_GUEST_ID=$(cat /tmp/g-create.json | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('guest',{}).get('id') or d.get('id',''))" 2>/dev/null)
echo "NEW_GUEST_ID=$NEW_GUEST_ID"

# D2: Edit guest
if [ -n "$NEW_GUEST_ID" ]; then
  code=$(curl -s -o /tmp/g-edit.json -w "%{http_code}" \
    -X PUT "$BASE/api/admin/guests/$NEW_GUEST_ID" \
    -H "Cookie: $OWNER_COOKIE" \
    -H "Content-Type: application/json" \
    -H "Origin: $BASE" \
    -H "x-requested-with: khat" \
    -d "{\"name\":\"$GUEST_NAME UPDATED\",\"bio\":\"UAT bio updated\"}" --max-time 20)
  check_http "PUT /api/admin/guests/:id (edit)" "200" "$code" ""
else
  record "PUT /api/admin/guests/:id (edit)" "FAIL" "no guest id"
fi

# D3: Delete guest
if [ -n "$NEW_GUEST_ID" ]; then
  code=$(curl -s -o /tmp/g-delete.json -w "%{http_code}" \
    -X DELETE "$BASE/api/admin/guests/$NEW_GUEST_ID" \
    -H "Cookie: $OWNER_COOKIE" \
    -H "Origin: $BASE" \
    -H "x-requested-with: khat" --max-time 20)
  check_http "DELETE /api/admin/guests/:id" "200" "$code" ""
fi

# ============================================================
# Summary
# ============================================================
echo ""
echo "============================================================"
echo "UAT SUMMARY: $PASS passed, $FAIL failed"
echo "============================================================"
for r in "${RESULTS[@]}"; do
  echo "$r"
done
if [ $FAIL -gt 0 ]; then exit 1; fi
exit 0
