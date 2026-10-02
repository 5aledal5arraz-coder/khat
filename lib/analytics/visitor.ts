/**
 * The visitor counter's rules — pure, server-only, unit-tested
 * (tests/analytics/visitor.test.ts). The endpoint (app/api/track/route.ts)
 * is a thin shell around `buildPageView()`.
 *
 * Privacy contract (Khaled, 2026-10-02 — «عداد خاص فينا»):
 *   • No cookie, no localStorage id, no third party.
 *   • The raw IP is NEVER stored. `visitor_id` is a truncated
 *     sha256(daily salt ‖ ip ‖ user-agent). The salt is an HMAC of a server
 *     secret and the Kuwait calendar day, so the same person gets a new id
 *     every day: we can count «visitors today», we cannot follow anyone
 *     across days, and without the secret the id cannot be brute-forced
 *     back to an IP (the IPv4 space is small enough that an unsalted hash
 *     could be).
 *   • The full user-agent is not stored either — only a device class.
 *   • Do-Not-Track / Global Privacy Control are honoured: nothing is recorded.
 *   • Staff (an `__admin_session` cookie) and bots are not counted.
 */

import crypto from "crypto"
import { env } from "@/lib/env"
import { isTrackablePath, normalizePath } from "./paths"

export const PAGE_VIEW_EVENT = "page_view"

/** The tz every «day» on the counter is measured in — the salt AND the admin card. */
export const VISITOR_TZ = "Asia/Kuwait"

export const VISITOR_ID_LENGTH = 32

/** /api/track body cap. A real body is ~150 bytes (`{"path":…,"referrer":…}`). */
export const MAX_BODY_BYTES = 2048

/** /api/track per-IP limit. A person reading makes a few views a minute; 60 per 10 min is far above that. */
export const TRACK_RATE_LIMIT = { max: 60, windowMs: 10 * 60 * 1000 }

// ─── Bots ────────────────────────────────────────────────────────────────────

/**
 * Crawlers, link-preview fetchers and scripted clients. A preview fetch
 * (WhatsApp, Telegram, Slack, iMessage via facebookexternalhit) happens once
 * per SHARE, not per reader, so counting it would inflate exactly the
 * channels Khaled most wants to read honestly.
 */
const BOT_UA =
  /bot|crawl|spider|slurp|preview|headless|lighthouse|pagespeed|facebookexternalhit|facebookcatalog|whatsapp|telegram|twitterbot|slack|discord|embedly|vkshare|pinterest|curl|wget|python|axios|node-fetch|undici|go-http|java\/|okhttp|libwww|httpclient|postman|insomnia|scrapy|phantom|selenium|puppeteer|playwright|monitor|uptime|statuscake|pingdom/i

export function isBotUserAgent(ua: string | null | undefined): boolean {
  if (!ua || ua.trim().length < 10) return true // no real browser sends nothing
  return BOT_UA.test(ua)
}

// ─── Device ──────────────────────────────────────────────────────────────────

export type DeviceClass = "mobile" | "tablet" | "desktop"

/**
 * Coarse on purpose. Known blind spot: iPadOS Safari announces itself as a
 * Mac, so iPads read as `desktop` — no header-only check can tell them apart.
 */
export function deviceClass(ua: string): DeviceClass {
  if (/iPad|Tablet|PlayBook|Silk|Kindle/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua))) {
    return "tablet"
  }
  if (/Mobi|iPhone|iPod|Android|Windows Phone|IEMobile|Opera Mini/i.test(ua)) return "mobile"
  return "desktop"
}

// ─── Referrer → source ───────────────────────────────────────────────────────

export const SOURCE_KEYS = [
  "google",
  "youtube",
  "x",
  "instagram",
  "whatsapp",
  "tiktok",
  "facebook",
  "other",
  "direct",
  "internal",
] as const
export type TrafficSource = (typeof SOURCE_KEYS)[number]

const SOURCE_HOSTS: Array<[Exclude<TrafficSource, "other" | "direct" | "internal">, RegExp]> = [
  ["google", /(^|\.)google\.[a-z.]+$|^com\.google\.android\.googlequicksearchbox$/],
  ["youtube", /(^|\.)(youtube\.com|youtu\.be)$/],
  ["x", /(^|\.)(x\.com|twitter\.com|t\.co)$/],
  ["instagram", /(^|\.)instagram\.com$/],
  ["whatsapp", /(^|\.)(whatsapp\.com|whatsapp\.net|wa\.me)$/],
  ["tiktok", /(^|\.)tiktok\.com$/],
  ["facebook", /(^|\.)(facebook\.com|fb\.com|fb\.me)$/],
]

export interface ParsedReferrer {
  source: TrafficSource
  /** HOST of an external referrer only (no path, no query); null for direct/internal. */
  referrer: string | null
}

/**
 * Buckets a referrer. Same-site referrers are `internal` — a click from one
 * of our pages to another is navigation, not a traffic source. `siteHost` is
 * the Host header the request arrived on; `khatpodcast.com` and its `www.`
 * twin are always treated as same-site so a host mismatch between the two can
 * never turn our own pages into «other».
 */
export function classifyReferrer(raw: unknown, siteHost: string | null): ParsedReferrer {
  if (typeof raw !== "string" || raw.trim() === "") return { source: "direct", referrer: null }
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    return { source: "other", referrer: null }
  }
  // Android apps hand over `android-app://<package>/` as the referrer.
  const host =
    url.protocol === "android-app:" ? url.hostname.toLowerCase() : url.hostname.toLowerCase().replace(/^www\./, "")
  const site = (siteHost ?? "").toLowerCase().split(":")[0].replace(/^www\./, "")
  if (host === "khatpodcast.com" || (site && host === site)) return { source: "internal", referrer: null }
  if (url.protocol !== "http:" && url.protocol !== "https:" && url.protocol !== "android-app:") {
    return { source: "other", referrer: null }
  }
  // Host only: a referrer PATH can name a private page on someone else's site
  // (a search, a profile, a chat). The source bucket is what the card reads.
  const referrer = host.slice(0, 253) || null
  for (const [source, re] of SOURCE_HOSTS) {
    if (re.test(host)) return { source, referrer }
  }
  return { source: "other", referrer }
}

// ─── Abuse limits ────────────────────────────────────────────────────────────

// `rateLimitKey` (IPv6 → its /64) moved to lib/rate-limit.ts on 2026-10-02 so
// EVERY per-IP limit uses it; re-exported here for existing importers.
export { rateLimitKey } from "@/lib/rate-limit"

/** Process-wide ceiling on writes: past it, /api/track still answers 204 but writes nothing. */
export const GLOBAL_INSERT_CAP = { max: 600, windowMs: 60 * 1000 }

let capWindowStart = 0
let capCount = 0

/**
 * Take one slot from the global insert budget. A flood spread across many IPs
 * passes every per-IP limit; this is what keeps it from turning into 600+
 * INSERTs a minute on a pool whose ceiling is 22 connections.
 */
export function takeGlobalInsertSlot(now: number = Date.now()): boolean {
  if (now - capWindowStart >= GLOBAL_INSERT_CAP.windowMs) {
    capWindowStart = now
    capCount = 0
  }
  if (capCount >= GLOBAL_INSERT_CAP.max) return false
  capCount++
  return true
}

/** Test seam. */
export function resetGlobalInsertCap(): void {
  capWindowStart = 0
  capCount = 0
}

// ─── Visitor id ──────────────────────────────────────────────────────────────

const kuwaitDayFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: VISITOR_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
})

/** `YYYY-MM-DD` of `now` on the Kuwait calendar — the day the admin card uses. */
export function kuwaitDay(now: Date): string {
  return kuwaitDayFmt.format(now)
}

/**
 * The server secret the daily salt is derived from. REQUIRED and dedicated
 * (Yousef, 2026-10-02): no fallback to another feature's key, so rotating the
 * newsletter secret or the Resend key can never silently re-key — or expose —
 * the visitor hash. Unset → `buildPageView` records nothing.
 */
export function visitorSecret(): string | null {
  return env.ANALYTICS_SALT_SECRET || null
}

export function dailySalt(secret: string, day: string): string {
  return crypto.createHmac("sha256", secret).update(`khat-visitor-salt:${day}`).digest("hex")
}

export function visitorId(args: { secret: string; day: string; ip: string; userAgent: string }): string {
  return crypto
    .createHash("sha256")
    .update(`${dailySalt(args.secret, args.day)}|${args.ip}|${args.userAgent}`)
    .digest("hex")
    .slice(0, VISITOR_ID_LENGTH)
}

// ─── The decision ────────────────────────────────────────────────────────────

export type SkipReason =
  | "no_secret"
  | "privacy_signal"
  | "admin"
  | "bot"
  | "bad_body"
  | "untracked_path"

export interface PageViewRow {
  visitor_id: string
  event_type: typeof PAGE_VIEW_EVENT
  event_data: { source: TrafficSource; device: DeviceClass }
  page_path: string
  referrer: string | null
  /** Deliberately the device CLASS, never the raw UA string. */
  user_agent: DeviceClass
}

export interface PageViewInput {
  body: unknown
  ip: string
  userAgent: string | null
  host: string | null
  hasAdminSession: boolean
  dnt: string | null
  gpc: string | null
  now: Date
  secret: string | null
}

/**
 * Everything the endpoint decides, in one pure function. Returns the row to
 * insert, or the reason nothing is recorded. Order matters only for cost: the
 * cheap header checks run before any parsing or hashing.
 */
export function buildPageView(input: PageViewInput): { row: PageViewRow } | { skip: SkipReason } {
  if (!input.secret) return { skip: "no_secret" }
  if (input.dnt === "1" || input.gpc === "1") return { skip: "privacy_signal" }
  if (input.hasAdminSession) return { skip: "admin" }
  if (isBotUserAgent(input.userAgent)) return { skip: "bot" }
  const ua = input.userAgent as string

  if (typeof input.body !== "object" || input.body === null) return { skip: "bad_body" }
  const body = input.body as Record<string, unknown>
  const path = normalizePath(body.path)
  if (!path) return { skip: "bad_body" }
  if (!isTrackablePath(path)) return { skip: "untracked_path" }

  const { source, referrer } = classifyReferrer(body.referrer, input.host)
  const device = deviceClass(ua)
  return {
    row: {
      visitor_id: visitorId({ secret: input.secret, day: kuwaitDay(input.now), ip: input.ip, userAgent: ua }),
      event_type: PAGE_VIEW_EVENT,
      event_data: { source, device },
      page_path: path,
      referrer,
      user_agent: device,
    },
  }
}
