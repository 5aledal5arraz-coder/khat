#!/bin/bash
# Wave 4: admin mutation flows via HTTP against production server
set -u
BASE="http://localhost:3000"
OWNER=$(python3 -c "import json; print(json.load(open('/tmp/khat-uat-owner.json'))['token'])")
EDITOR=$(python3 -c "import json; print(json.load(open('/tmp/khat-uat-editor.json'))['token'])")
COOKIE="__admin_session=$OWNER"

PASS=0
FAIL=0
pass() { PASS=$((PASS+1)); echo "PASS - $1 :: $2"; }
fail() { FAIL=$((FAIL+1)); echo "FAIL - $1 :: $2"; }

echo "=== WAVE 4: Admin mutation flows via HTTP (production server) ==="

# 1. List episodes
code=$(curl -s -o /tmp/ep-list.json -w "%{http_code}" -H "Cookie: $COOKIE" "$BASE/api/episodes?limit=3")
if [ "$code" = "200" ]; then pass "GET /api/episodes (limit=3)" "HTTP $code"; else fail "GET /api/episodes" "HTTP $code"; fi

# 2. Create guest
GNAME="UAT Wave4 Guest $(date +%s)"
code=$(curl -s -o /tmp/g-create.json -w "%{http_code}" \
  -X POST "$BASE/api/admin/guests" \
  -H "Cookie: $COOKIE" \
  -H "Content-Type: application/json" \
  -H "Origin: $BASE" \
  -H "x-requested-with: khat" \
  -d "{\"name\":\"$GNAME\",\"bio\":\"wave4 bio\"}")
if [ "$code" = "200" ] || [ "$code" = "201" ]; then
  pass "POST /api/admin/guests" "HTTP $code"
else
  fail "POST /api/admin/guests" "HTTP $code $(cat /tmp/g-create.json)"
fi

GID=$(python3 -c "import json; d=json.load(open('/tmp/g-create.json')); print(d.get('guest',{}).get('id') or d.get('id',''))" 2>/dev/null || echo "")
GSLUG=$(python3 -c "import json; d=json.load(open('/tmp/g-create.json')); print(d.get('guest',{}).get('slug') or d.get('slug',''))" 2>/dev/null || echo "")
echo "created guest id=$GID slug=$GSLUG"

if [ -n "$GID" ] && [ -n "$GSLUG" ]; then
  # 3. Update
  code=$(curl -s -o /tmp/g-upd.json -w "%{http_code}" \
    -X PUT "$BASE/api/admin/guests/$GID" \
    -H "Cookie: $COOKIE" \
    -H "Content-Type: application/json" \
    -H "Origin: $BASE" \
    -H "x-requested-with: khat" \
    -d "{\"name\":\"$GNAME\",\"bio\":\"wave4 UPDATED bio\"}")
  if [ "$code" = "200" ]; then pass "PUT /api/admin/guests/:id" "HTTP $code"; else fail "PUT /api/admin/guests/:id" "HTTP $code"; fi

  # 4. Verify update visible on public
  sleep 1
  curl -s "$BASE/guests/$GSLUG" > /tmp/g-pub.html
  if grep -q "UPDATED" /tmp/g-pub.html; then pass "updated bio visible on public page" "cache invalidated"; else fail "updated bio visible on public page" "stale"; fi

  # 5. Delete
  code=$(curl -s -o /tmp/g-del.json -w "%{http_code}" \
    -X DELETE "$BASE/api/admin/guests/$GID" \
    -H "Cookie: $COOKIE" -H "Origin: $BASE" -H "x-requested-with: khat")
  if [ "$code" = "200" ]; then pass "DELETE /api/admin/guests/:id" "HTTP $code"; else fail "DELETE /api/admin/guests/:id" "HTTP $code"; fi

  # 6. Verify 404 body
  sleep 1
  curl -s "$BASE/guests/$GSLUG" > /tmp/g-pub2.html
  if grep -q "غير موجودة" /tmp/g-pub2.html; then pass "deleted guest body shows 404 UI" "notFound triggered (noindex)"; else fail "deleted guest body shows 404 UI" "still rendering"; fi
fi

# 7. Role check: EDITOR blocked from newsletter send
code=$(curl -s -o /tmp/ed-ns.json -w "%{http_code}" \
  -X POST "$BASE/api/admin/newsletter/send" \
  -H "Cookie: __admin_session=$EDITOR" \
  -H "Content-Type: application/json" \
  -H "Origin: $BASE" -H "x-requested-with: khat" \
  -d '{"subject":"x","content":"y","sendTo":"test"}')
if [ "$code" = "403" ]; then pass "EDITOR blocked from newsletter send" "HTTP 403"; else fail "EDITOR blocked from newsletter send" "HTTP $code"; fi

# 8. Unauth blocked from guest create
code=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "$BASE/api/admin/guests" \
  -H "Content-Type: application/json" \
  -H "Origin: $BASE" -H "x-requested-with: khat" \
  -d '{"name":"hack"}')
if [ "$code" = "401" ]; then pass "unauth blocked from guest create" "HTTP 401"; else fail "unauth blocked from guest create" "HTTP $code"; fi

# 9. CSRF: cross-origin with valid cookie
code=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "$BASE/api/admin/guests" \
  -H "Cookie: $COOKIE" \
  -H "Content-Type: application/json" \
  -H "Origin: https://evil.example.com" \
  -d '{"name":"csrf"}')
if [ "$code" = "403" ]; then pass "CSRF cross-origin blocked" "HTTP 403"; else fail "CSRF cross-origin blocked" "HTTP $code"; fi

# 10. Guest candidates list
code=$(curl -s -o /tmp/cand.json -w "%{http_code}" \
  -H "Cookie: $COOKIE" "$BASE/api/admin/submissions/guests")
if [ "$code" = "200" ]; then pass "GET /api/admin/submissions/guests" "HTTP $code"; else fail "GET /api/admin/submissions/guests" "HTTP $code"; fi

# 11. Sponsor candidates list
code=$(curl -s -o /tmp/cand2.json -w "%{http_code}" \
  -H "Cookie: $COOKIE" "$BASE/api/admin/submissions/sponsors")
if [ "$code" = "200" ]; then pass "GET /api/admin/submissions/sponsors" "HTTP $code"; else fail "GET /api/admin/submissions/sponsors" "HTTP $code"; fi

# 12. Studio list
code=$(curl -s -o /tmp/studio.json -w "%{http_code}" \
  -H "Cookie: $COOKIE" "$BASE/api/admin/studio")
if [ "$code" = "200" ]; then pass "GET /api/admin/studio" "HTTP $code"; else fail "GET /api/admin/studio" "HTTP $code"; fi

# 13. Newsletter subscribers list
code=$(curl -s -o /tmp/ns-list.json -w "%{http_code}" \
  -H "Cookie: $COOKIE" "$BASE/api/admin/newsletter/generate")
if [ "$code" = "200" ] || [ "$code" = "405" ]; then pass "newsletter endpoint reachable" "HTTP $code"; else fail "newsletter endpoint" "HTTP $code"; fi

# 14. Public sitemap
code=$(curl -s -o /tmp/sm.xml -w "%{http_code}" "$BASE/sitemap.xml")
if [ "$code" = "200" ]; then pass "GET /sitemap.xml" "HTTP $code"; else fail "GET /sitemap.xml" "HTTP $code"; fi
if grep -q "<urlset" /tmp/sm.xml 2>/dev/null; then pass "sitemap has <urlset>" "valid XML"; else fail "sitemap has <urlset>" "invalid"; fi

# 15. Public RSS
code=$(curl -s -o /tmp/rss.xml -w "%{http_code}" "$BASE/api/rss")
if [ "$code" = "200" ] || [ "$code" = "404" ]; then pass "GET /api/rss" "HTTP $code"; else fail "GET /api/rss" "HTTP $code"; fi

# 16. Admin page redirect when unauth
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/admin")
if [ "$code" = "307" ] || [ "$code" = "302" ]; then pass "unauth /admin redirects to login" "HTTP $code"; else fail "unauth /admin redirect" "HTTP $code"; fi

echo ""
echo "=== WAVE 4 SUMMARY: $PASS passed, $FAIL failed ==="
if [ $FAIL -gt 0 ]; then exit 1; fi
exit 0
