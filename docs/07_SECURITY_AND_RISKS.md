# 07 — Security Audit and Top Production Risks

## Authentication & Authorization

### Admin Auth (`lib/api-utils.ts`)

**Pattern:** Two auth functions:
- `requireAdmin()` — For server actions. Throws on failure.
- `requireAdminAPI()` — For API routes. Returns `NextResponse` error on failure.

**Flow:**
1. Get Supabase auth user from cookies
2. Query `profiles` table for `is_admin` flag
3. Block if not authenticated or not admin

**CRITICAL: Admin Bypass**
```typescript
// lib/api-utils.ts:79
if (process.env.ADMIN_AUTH_BYPASS === 'true') return
```
- When `ADMIN_AUTH_BYPASS=true` in environment, ALL admin auth is skipped
- Both server actions and API routes are affected
- **Risk:** If accidentally set in production, entire admin panel is open to anyone
- **Recommendation:** Remove bypass or restrict to `NODE_ENV === 'development'`

### User Auth (Hibr)

- Supabase Auth via `@supabase/ssr`
- Session cookies managed by Supabase SSR helper
- `AuthProvider` context wraps entire app
- Protected routes check auth before rendering

### Row Level Security (RLS)

All Hibr tables have RLS enabled with proper policies:
- Public content readable by all
- Writes restricted to authenticated owner
- Admin override for moderation actions

---

## CSRF Protection

**File:** `lib/api-utils.ts`

Two layers for mutation endpoints:

1. **Origin validation:** `validateOrigin()` — checks `Origin` header matches `Host`
2. **Custom header:** `validateCustomHeader()` — requires `x-requested-with: khat`

**Applied via:** `validateMutation(request)` at the start of mutation API routes.

**Limitations:**
- Custom header can be forged by any JavaScript running on the page
- No CSRF token rotation
- No double-submit cookie pattern
- **Adequate for current threat model** (single-admin, not a banking app)

---

## Input Validation & Sanitization

### Validation (`lib/validation.ts`)

11 validation functions for different input types:
- `validateArticleTitle()` — 3-200 chars
- `validateArticleContent()` — 10-50000 chars
- `validateThoughtContent()` — 1-280 chars
- `validateCommentContent()` — 1-500 chars
- `validateDisplayName()` — 2-50 chars
- `validateTags()` — max 5 tags, 1-30 chars each
- etc.

All return `{ valid: boolean, error?: string }`.

### Sanitization (`lib/sanitize.ts`)

Uses `isomorphic-dompurify` (works on server and client):
- `stripHtml()` — Removes ALL HTML tags
- `sanitizeArticleContent()` — Strips HTML from article text
- `sanitizeTitle()` — Strips HTML from titles
- `sanitizeThought()` — Strips HTML from thoughts
- `sanitizeComment()` — Strips HTML from comments

**Note:** Article content stored as plain text, not rich HTML. DOMPurify with `ALLOWED_TAGS: []` strips everything.

### Content Moderation (`lib/moderation.ts`)

Three-tier moderation pipeline:

1. **Profanity filter:** Arabic + English bad word lists. Normalizes Arabic characters (removes diacritics, normalizes hamza forms) before matching.
   - **Issue:** Uses regex `/<[^>]*>/g` for HTML stripping instead of `stripHtml()` from sanitize module. Regex-based HTML stripping is less secure.

2. **Spam detection:** Checks for repetitive text, excessive caps, URL spam, too many hashtags.

3. **AI moderation (optional):** Sends to OpenAI for content policy check via `moderateWithAI()`.

**Trust-based auto-approval:** Users with >N approved posts get auto-approved for new content:
```typescript
const approvedCount = await getUserApprovedCount(userId)
if (approvedCount >= TRUST_THRESHOLD) → auto-approve
```

---

## Rate Limiting

### IP-Based (In-Memory)

**File:** `lib/rate-limit.ts` → `checkIpRateLimit()`

In-memory `Map<string, { count, resetAt }>`. Used for:
- Media kit password attempts: 5/15min
- Guest application: configurable

**Limitation:** Resets on server restart. Not shared across instances.

### DB-Based (Authenticated Users)

**File:** `lib/rate-limit.ts` → `checkUserRateLimit()`

Uses `rate_limits` Supabase table. Per-user, per-action limits:
- Article creation: limited per hour
- Thought creation: limited per hour
- Comment creation: limited per minute
- Report creation: limited per day

**Fail behavior:** On DB error, rate limiting is **disabled** (fails open). Good for UX, risky for spam.

### AI Generation (In-Memory)

Studio AI routes use simple timestamp-based throttle:
```typescript
const recentCalls = new Map<string, number>()
// 10-second cooldown per session ID
```
**Issue:** Map grows unbounded (memory leak over time with many session IDs). No cleanup.

---

## Known Security Issues

### Critical

| # | Issue | File | Line | Impact |
|---|-------|------|------|--------|
| 1 | Admin auth bypass in production code | `lib/api-utils.ts` | 79, 91 | Full admin access if env var set |
| 2 | Missing `requireAdminAPI()` on transcript upload | `api/admin/studio/[id]/transcript/upload/route.ts` | ~14 | Unauthorized transcript upload |
| 3 | Missing `requireAdminAPI()` on Whisper route | `api/admin/studio/[id]/transcript/whisper/route.ts` | ~17 | Unauthorized API abuse (costs money) |
| 4 | Missing `requireAdminAPI()` on video upload | `api/admin/content/upload-video/route.ts` | ~21 | Unauthorized file upload |

### High

| # | Issue | File | Impact |
|---|-------|------|--------|
| 5 | Regex HTML stripping in moderation | `lib/moderation.ts:170` | XSS bypass in moderation checks |
| 6 | YouTube proxy returns raw content | `api/admin/studio/youtube-proxy/route.ts` | Content-Type injection if YouTube returns HTML |
| 7 | Race conditions in config file writes | Multiple action files | Data loss on concurrent edits |
| 8 | Weak email regex in forms | Multiple route.ts files | Accepts invalid emails |

### Medium

| # | Issue | File | Impact |
|---|-------|------|--------|
| 9 | In-memory rate limiter memory leak | Studio AI routes | Memory growth over time |
| 10 | No rate limit on event recording | `api/events/route.ts` | Potential spam to visitor_events |
| 11 | Count update race conditions | Space comment/like/follow routes | Inconsistent counts |
| 12 | Admin edit bypasses re-sanitization | Moderation route | Unsanitized admin edits |

---

## Top 10 Production Risks

### 1. ADMIN_AUTH_BYPASS Accidentally Enabled
**Risk:** Total admin panel exposure
**Likelihood:** Medium (env var copy-paste error)
**Mitigation:** Remove bypass or add `NODE_ENV === 'development'` guard

### 2. Supabase Downtime
**Risk:** All DB-dependent features fail
**Likelihood:** Low (managed service)
**Impact:** Episodes still show (YouTube + cache fallback), Hibr goes down, Studio goes down
**Mitigation:** Mock data fallbacks exist but are incomplete

### 3. OpenAI API Key Leaked or Quota Exceeded
**Risk:** Studio AI generation stops; potential financial exposure
**Likelihood:** Medium
**Impact:** Studio pipeline blocked, content moderation AI disabled
**Mitigation:** Key stored in env vars (not committed), but no spend alerts configured

### 4. Config File Corruption
**Risk:** JSON parse error on any config file breaks features
**Likelihood:** Low-Medium (atomic writes help, but concurrent access possible)
**Impact:** Episodes missing overrides, quotes not showing, paths broken
**Mitigation:** Config store uses atomic write (tmp + rename) and per-file queue

### 5. YouTube API Quota Exhaustion
**Risk:** Episode data stops updating
**Likelihood:** Medium (daily quota limit)
**Impact:** New episodes don't appear, thumbnails stale
**Mitigation:** Episode cache layer (`lib/cache/episode-cache.ts`) serves stale data

### 6. Visitor Events Table Growth
**Risk:** Unbounded table growth degrades query performance
**Likelihood:** High (no cleanup policy)
**Impact:** Admin analytics slow, personalization slow
**Mitigation:** Add retention policy (delete events older than 90 days)

### 7. Studio Audio Files Fill Disk
**Risk:** Large audio uploads (up to 200MB) accumulate
**Likelihood:** Medium
**Impact:** Disk full → application crashes
**Mitigation:** Auto-cleanup on session delete exists, but abandoned sessions not cleaned

### 8. Content Moderation False Negatives
**Risk:** Offensive content passes through moderation
**Likelihood:** Medium (profanity list not exhaustive, AI moderation optional)
**Impact:** Community trust damage
**Mitigation:** Report system + admin moderation panel + trust-based escalation

### 9. Single Admin Point of Failure
**Risk:** Only one admin account manages everything
**Likelihood:** High (current architecture)
**Impact:** If admin loses access, no content updates possible
**Mitigation:** Add multi-admin support with role-based permissions

### 10. No Automated Backups
**Risk:** Config files stored in filesystem (not in DB) have no backup
**Likelihood:** Medium
**Impact:** Loss of all episode overrides, quotes, enrichments, settings
**Mitigation:** Git tracks config files; ensure regular commits of config changes

---

## Environment Variables

| Variable | Required | Purpose | Risk if Exposed |
|----------|----------|---------|-----------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL | Low (public) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anonymous key | Low (public, RLS protects) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only | Supabase admin key | **CRITICAL** — full DB access |
| `OPENAI_API_KEY` | For AI features | OpenAI API access | High — financial exposure |
| `YOUTUBE_API_KEY` | For YouTube data | YouTube Data API | Medium — quota abuse |
| `ADMIN_AUTH_BYPASS` | Dev only | Skip admin auth | **CRITICAL** — full admin access |
| `NEXT_PUBLIC_HIBR_USE_DB` | Feature toggle | Hibr database mode | Low |
