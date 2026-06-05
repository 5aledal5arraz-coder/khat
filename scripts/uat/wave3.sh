#!/bin/bash
# Wave 3: uploads, admin↔public sync, rendering
set -u
BASE="http://localhost:3000"
OWNER=$(cat /tmp/khat-uat-owner.json | python3 -c "import json,sys; print(json.load(sys.stdin)['token'])")
OWNER_COOKIE="__admin_session=$OWNER"

PASS=0
FAIL=0
RESULTS=()

record() {
  local name="$1"; local status="$2"; local detail="$3"
  if [ "$status" = "PASS" ]; then PASS=$((PASS+1)); else FAIL=$((FAIL+1)); fi
  RESULTS+=("$status | $name | $detail")
  echo "$status - $name :: $detail"
}

check() {
  local name="$1"; local expected="$2"; local got="$3"; local extra="$4"
  if [ "$got" = "$expected" ]; then
    record "$name" "PASS" "HTTP $got $extra"
  else
    record "$name" "FAIL" "expected $expected got $got $extra"
  fi
}

# ============================================================
# Section G — Uploads
# ============================================================
echo "=== G. UPLOADS ==="

# G1: Create a tiny valid PNG (8x8 red) with correct magic bytes
python3 -c "
import struct, zlib, sys
def chunk(t, d):
    return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t+d) & 0xffffffff)
sig = b'\\x89PNG\\r\\n\\x1a\\n'
ihdr = chunk(b'IHDR', struct.pack('>IIBBBBB', 8, 8, 8, 2, 0, 0, 0))
raw = b''
for _ in range(8):
    raw += b'\\x00' + b'\\xff\\x00\\x00'*8
idat = chunk(b'IDAT', zlib.compress(raw))
iend = chunk(b'IEND', b'')
sys.stdout.buffer.write(sig+ihdr+idat+iend)
" > /tmp/uat-valid.png
ls -l /tmp/uat-valid.png
file /tmp/uat-valid.png

# G2: Upload valid PNG to guests upload endpoint
code=$(curl -s -o /tmp/up-valid.json -w "%{http_code}" \
  -X POST "$BASE/api/admin/guests/upload" \
  -H "Cookie: $OWNER_COOKIE" \
  -H "Origin: $BASE" \
  -H "x-requested-with: khat" \
  -F "file=@/tmp/uat-valid.png" --max-time 30)
check "POST guests/upload (valid PNG)" "200" "$code" "$(head -c 140 /tmp/up-valid.json)"

# Extract uploaded URL and verify file exists
UPLOADED_URL=$(cat /tmp/up-valid.json | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('url') or d.get('path',''))" 2>/dev/null)
if [ -n "$UPLOADED_URL" ]; then
  # Try to GET it via static server
  code2=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$UPLOADED_URL" --max-time 10)
  check "Uploaded file is served back" "200" "$code2" "url=$UPLOADED_URL"
  # Clean up the file
  FNAME=$(basename "$UPLOADED_URL")
  rm -f "public/guests/$FNAME" 2>/dev/null
else
  record "Uploaded file is served back" "FAIL" "no URL in response"
fi

# G3: Upload a fake PNG (text with .png extension) — magic bytes should reject
echo "not actually a png, just text" > /tmp/uat-fake.png
code=$(curl -s -o /tmp/up-fake.json -w "%{http_code}" \
  -X POST "$BASE/api/admin/guests/upload" \
  -H "Cookie: $OWNER_COOKIE" \
  -H "Origin: $BASE" \
  -H "x-requested-with: khat" \
  -F "file=@/tmp/uat-fake.png" --max-time 30)
if [ "$code" = "400" ] || [ "$code" = "415" ] || [ "$code" = "422" ]; then
  record "POST guests/upload (fake PNG) rejected" "PASS" "HTTP $code $(cat /tmp/up-fake.json)"
else
  record "POST guests/upload (fake PNG) rejected" "FAIL" "HTTP $code (should be 4xx) body=$(cat /tmp/up-fake.json)"
fi

# G4: Unauth upload
code=$(curl -s -o /tmp/up-noauth.json -w "%{http_code}" \
  -X POST "$BASE/api/admin/guests/upload" \
  -H "Origin: $BASE" \
  -H "x-requested-with: khat" \
  -F "file=@/tmp/uat-valid.png" --max-time 20)
check "POST guests/upload (unauth)" "401" "$code" ""

# ============================================================
# Section H — Admin ↔ Public sync
# ============================================================
echo "=== H. ADMIN ↔ PUBLIC SYNC ==="

# H1: Create guest via admin API
GNAME="UAT Sync Guest $(date +%s)"
curl -s -o /tmp/sg.json \
  -X POST "$BASE/api/admin/guests" \
  -H "Cookie: $OWNER_COOKIE" \
  -H "Content-Type: application/json" \
  -H "Origin: $BASE" \
  -H "x-requested-with: khat" \
  -d "{\"name\":\"$GNAME\",\"bio\":\"UAT sync bio\"}" --max-time 20
NEW_GUEST_ID=$(cat /tmp/sg.json | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('guest',{}).get('id') or d.get('id',''))" 2>/dev/null)
NEW_GUEST_SLUG=$(cat /tmp/sg.json | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('guest',{}).get('slug') or d.get('slug',''))" 2>/dev/null)
echo "Created guest id=$NEW_GUEST_ID slug=$NEW_GUEST_SLUG"

if [ -n "$NEW_GUEST_ID" ] && [ -n "$NEW_GUEST_SLUG" ]; then
  sleep 1
  # H2: Verify it appears on /guests listing
  curl -s "$BASE/guests" --max-time 20 > /tmp/pub-guests.html
  if grep -q "$GNAME" /tmp/pub-guests.html; then
    record "New guest visible on public /guests" "PASS" "name found in HTML"
  else
    record "New guest visible on public /guests" "FAIL" "name not in HTML"
  fi

  # H3: Verify individual guest page renders with JSON-LD
  code=$(curl -s -o /tmp/pub-guest.html -w "%{http_code}" "$BASE/guests/$NEW_GUEST_SLUG" --max-time 20)
  check "GET /guests/:slug renders" "200" "$code" ""
  if grep -q "application/ld+json" /tmp/pub-guest.html && grep -q '"@type":"Person"' /tmp/pub-guest.html; then
    record "Guest page has Person JSON-LD" "PASS" "schema.org Person present"
  else
    record "Guest page has Person JSON-LD" "FAIL" "schema missing"
  fi
  if grep -q "$GNAME" /tmp/pub-guest.html; then
    record "Guest page shows guest name" "PASS" "name rendered"
  else
    record "Guest page shows guest name" "FAIL" "name not rendered"
  fi

  # H4: Edit guest name via admin API, verify updated name appears on page
  UPDATED_NAME="$GNAME UPDATED"
  curl -s -o /tmp/sg-edit.json \
    -X PUT "$BASE/api/admin/guests/$NEW_GUEST_ID" \
    -H "Cookie: $OWNER_COOKIE" \
    -H "Content-Type: application/json" \
    -H "Origin: $BASE" \
    -H "x-requested-with: khat" \
    -d "{\"name\":\"$UPDATED_NAME\",\"bio\":\"UAT updated bio\"}" --max-time 20
  sleep 1
  curl -s "$BASE/guests/$NEW_GUEST_SLUG" --max-time 20 > /tmp/pub-guest2.html
  if grep -q "UPDATED" /tmp/pub-guest2.html; then
    record "Edited guest reflected on public page (cache invalidated)" "PASS" "UPDATED visible"
  else
    record "Edited guest reflected on public page (cache invalidated)" "FAIL" "old name still cached"
  fi

  # H5: Delete guest via admin API, verify 404 on public page
  curl -s -o /dev/null -X DELETE "$BASE/api/admin/guests/$NEW_GUEST_ID" \
    -H "Cookie: $OWNER_COOKIE" \
    -H "Origin: $BASE" \
    -H "x-requested-with: khat" --max-time 20
  sleep 1
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/guests/$NEW_GUEST_SLUG" --max-time 20)
  if [ "$code" = "404" ]; then
    record "Deleted guest returns 404 on public page" "PASS" ""
  else
    record "Deleted guest returns 404 on public page" "FAIL" "got $code"
  fi
else
  record "Guest sync flow setup" "FAIL" "no guest id/slug"
fi

# H6: Verify existing episode slug page renders with episode content
EXISTING_SLUG=$(curl -s "$BASE/api/episodes?limit=1" --max-time 15 | python3 -c "import json,sys; d=json.load(sys.stdin); eps=d if isinstance(d,list) else d.get('episodes',[]); print(eps[0]['slug'] if eps else '')" 2>/dev/null)
if [ -n "$EXISTING_SLUG" ]; then
  code=$(curl -s -o /tmp/pub-ep.html -w "%{http_code}" "$BASE/episodes/$EXISTING_SLUG" --max-time 30)
  check "GET /episodes/:slug (existing)" "200" "$code" "slug=$EXISTING_SLUG"
else
  record "GET /episodes/:slug (existing)" "SKIP" "no episodes to test"
fi

# ============================================================
# Section I — Candidate/Guest Applications end-to-end
# ============================================================
echo "=== I. GUEST APPLICATIONS ==="

# I1: List candidates via admin API
code=$(curl -s -o /tmp/cand-list.json -w "%{http_code}" \
  -H "Cookie: $OWNER_COOKIE" \
  "$BASE/api/admin/submissions/guests" --max-time 20)
if [ "$code" = "200" ] || [ "$code" = "404" ]; then
  record "List guest submissions" "PASS" "HTTP $code"
else
  record "List guest submissions" "FAIL" "HTTP $code"
fi

echo ""
echo "============================================================"
echo "WAVE 3 SUMMARY: $PASS passed, $FAIL failed"
echo "============================================================"
for r in "${RESULTS[@]}"; do echo "$r"; done
if [ $FAIL -gt 0 ]; then exit 1; fi
exit 0
