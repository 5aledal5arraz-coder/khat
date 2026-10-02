/**
 * Which paths the visitor counter may record — shared by the client beacon
 * (components/layout/visit-beacon.tsx) and the server endpoint
 * (app/api/track/route.ts), so the two can never disagree.
 *
 * An ALLOWLIST, not a denylist, on purpose: the private surfaces carry secrets
 * in the path itself (/prepare/<token>, /candidate-prep/<token>,
 * /offer/<token>, /media-kit/<slug>, /unsubscribe). A denylist that misses one
 * new private route would write that token into `analytics_events`; an
 * allowlist that misses one new public route only under-counts it.
 *
 * Client-safe: no Node imports.
 */

/** Public pages counted by exact path. */
const EXACT_PATHS = new Set([
  "/",
  "/episodes",
  "/guests",
  "/about",
  "/contact",
  "/contribute",
  "/listen",
  "/partner",
  "/guest",
  "/guest/status",
])

/** Public detail pages: the prefix plus exactly ONE non-empty segment. */
const DETAIL_PREFIXES = ["/episodes/", "/guests/", "/stories/", "/topics/", "/categories/", "/quotes/"]

/** Longest path we store. Real slugs are far shorter; this only caps abuse. */
export const MAX_PATH_LENGTH = 300

/** Longest dynamic segment we accept — the editorial slugifier's own cap (lib/editorial/publish-types.ts). */
export const MAX_SLUG_LENGTH = 120

/**
 * The characters our slug generators can emit, and nothing else:
 * `lib/youtube/queries.ts` and `lib/editorial/publish-types.ts` keep the whole
 * Arabic block (U+0600–U+06FF — real slugs carry «،» and «؟»), a-z, 0-9 and
 * `-`; a YouTube video-id fallback adds A-Z and `_`; quote ids are UUIDs.
 * Anything else in a detail segment is a probe, not a page, and is never
 * stored — so it can never be shown on the admin card either.
 */
const SLUG_RE = /^[\u0600-\u06FFA-Za-z0-9_-]+$/

/**
 * `"/episodes/abc/?x=1#t"` → `"/episodes/abc"`. Strips query + hash + trailing
 * slash, percent-decodes (so an Arabic slug is stored the way `episodes.slug`
 * holds it, and joins), and returns null for anything that is not a plain
 * absolute path or is too long.
 */
export function normalizePath(raw: unknown): string | null {
  if (typeof raw !== "string") return null
  let p = raw.split("#")[0].split("?")[0].trim()
  if (!p.startsWith("/") || p.startsWith("//")) return null
  try {
    p = decodeURIComponent(p)
  } catch {
    return null
  }
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1)
  if (p.length === 0 || p.length > MAX_PATH_LENGTH) return null
  if (/[\u0000-\u001f\u007f]/.test(p)) return null
  return p
}

/** True when `path` (already normalized) is a public page the counter records. */
export function isTrackablePath(path: string | null | undefined): boolean {
  if (!path) return false
  if (EXACT_PATHS.has(path)) return true
  for (const prefix of DETAIL_PREFIXES) {
    if (path.startsWith(prefix)) {
      const rest = path.slice(prefix.length)
      return rest.length > 0 && rest.length <= MAX_SLUG_LENGTH && SLUG_RE.test(rest)
    }
  }
  return false
}

/** Arabic names for the fixed public pages, for the admin «أكثر الصفحات». */
export const STATIC_PAGE_LABELS: Record<string, string> = {
  "/": "الرئيسية",
  "/episodes": "الحلقات",
  "/guests": "الضيوف",
  "/about": "من نحن",
  "/contact": "تواصل",
  "/contribute": "ساهم معنا",
  "/listen": "استمع",
  "/partner": "كن شريكاً",
  "/guest": "كن ضيفاً",
  "/guest/status": "متابعة طلب الضيف",
}
