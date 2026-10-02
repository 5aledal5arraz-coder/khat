/**
 * The visitor counter's rules (lib/analytics/visitor.ts + paths.ts) — pure,
 * no DB. The privacy contract is the feature: no raw IP, a daily-rotating id,
 * DNT/GPC honoured, staff and bots not counted, tokens never stored.
 */
import { describe, it, expect } from "vitest"
import {
  buildPageView,
  classifyReferrer,
  deviceClass,
  isBotUserAgent,
  kuwaitDay,
  visitorId,
  rateLimitKey,
  takeGlobalInsertSlot,
  resetGlobalInsertCap,
  GLOBAL_INSERT_CAP,
  VISITOR_ID_LENGTH,
  type PageViewInput,
} from "@/lib/analytics/visitor"
import { isTrackablePath, normalizePath, MAX_SLUG_LENGTH } from "@/lib/analytics/paths"

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"
const MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36"
const ANDROID_TABLET = "Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36"
const IP = "203.0.113.77"

function input(over: Partial<PageViewInput> = {}): PageViewInput {
  return {
    body: { path: "/episodes/abc", referrer: "https://www.google.com/" },
    ip: IP,
    userAgent: IPHONE,
    host: "khatpodcast.com",
    hasAdminSession: false,
    dnt: null,
    gpc: null,
    now: new Date("2026-10-02T12:00:00Z"),
    secret: "test-secret",
    ...over,
  }
}

describe("paths — allowlist, never a token", () => {
  it.each(["/", "/episodes", "/guests", "/about", "/episodes/slug", "/guests/x", "/stories/s", "/topics/t", "/quotes/1", "/guest"])(
    "%s is counted",
    (p) => expect(isTrackablePath(p)).toBe(true),
  )
  it.each([
    "/admin",
    "/admin/ops",
    "/api/track",
    "/prepare/secret-token",
    "/candidate-prep/tok",
    "/offer/tok",
    "/media-kit/acme",
    "/unsubscribe",
    "/maintenance",
    "/episodes/a/b",
    "/episodes//x",
  ])("%s is NOT counted", (p) => expect(isTrackablePath(normalizePath(p))).toBe(false))

  it("accepts every real slug shape — Arabic incl. «،» and «؟», YouTube ids, UUIDs", () => {
    for (const p of [
      "/episodes/الرجل-الذي-صنع-النصر-قبل-صلاح-الدين-الايوبي-،-قصة-نور-الدين-",
      "/episodes/كيف-تستعد-لوظيفة-المستقبل؟-خطوات-عملية",
      "/episodes/dQw4w9WgXcQ_-A",
      "/quotes/9c2fe9a2-03fa-4bac-8979-5ab1f27aa381",
    ]) expect(isTrackablePath(p), p).toBe(true)
  })

  it("rejects dynamic segments outside the slug charset or over the length cap", () => {
    for (const p of [
      "/episodes/a b",
      "/episodes/a.b",
      "/episodes/<script>",
      "/episodes/a%b",
      "/episodes/a'b",
      "/episodes/😀",
      `/episodes/${"a".repeat(MAX_SLUG_LENGTH + 1)}`,
    ]) expect(isTrackablePath(normalizePath(p)), p).toBe(false)
    expect(isTrackablePath(`/episodes/${"a".repeat(MAX_SLUG_LENGTH)}`)).toBe(true)
  })

  it("strips query, hash and trailing slash, and decodes Arabic slugs", () => {
    expect(normalizePath("/episodes/abc/?utm=1#t")).toBe("/episodes/abc")
    expect(normalizePath("/episodes/%D8%AE%D8%B7")).toBe("/episodes/خط")
  })
  it("rejects non-paths and oversized input", () => {
    expect(normalizePath("https://evil.com/x")).toBeNull()
    expect(normalizePath("//evil.com")).toBeNull()
    expect(normalizePath("/%E0%A4%A")).toBeNull()
    expect(normalizePath("/" + "a".repeat(400))).toBeNull()
    expect(normalizePath(42)).toBeNull()
  })
})

describe("bots", () => {
  it.each([
    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    "facebookexternalhit/1.1",
    "WhatsApp/2.23.20.0",
    "Twitterbot/1.0",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/120.0 Safari/537.36",
    "curl/8.4.0",
    "python-requests/2.31",
    "axios/1.6.0",
    "node-fetch/1.0",
    "",
  ])("drops %s", (ua) => expect(isBotUserAgent(ua)).toBe(true))
  it("keeps real browsers", () => {
    expect(isBotUserAgent(IPHONE)).toBe(false)
    expect(isBotUserAgent(MAC)).toBe(false)
  })
})

describe("device class", () => {
  it("classifies coarse device", () => {
    expect(deviceClass(IPHONE)).toBe("mobile")
    expect(deviceClass(MAC)).toBe("desktop")
    expect(deviceClass(ANDROID_TABLET)).toBe("tablet")
  })
})

describe("referrer → source", () => {
  const cases: Array<[string, string]> = [
    ["https://www.google.com/", "google"],
    ["https://www.google.com.kw/search", "google"],
    ["android-app://com.google.android.googlequicksearchbox/", "google"],
    ["https://m.youtube.com/watch", "youtube"],
    ["https://youtu.be/x", "youtube"],
    ["https://t.co/abc", "x"],
    ["https://x.com/khat", "x"],
    ["https://l.instagram.com/", "instagram"],
    ["https://wa.me/123", "whatsapp"],
    ["https://www.tiktok.com/@khat", "tiktok"],
    ["https://l.facebook.com/l.php", "facebook"],
    ["https://duckduckgo.com/", "other"],
    ["", "direct"],
    ["https://khatpodcast.com/episodes", "internal"],
    ["https://www.khatpodcast.com/", "internal"],
    ["http://localhost:3000/", "internal"],
  ]
  it.each(cases)("%s → %s", (ref, source) => {
    expect(classifyReferrer(ref, "localhost:3000").source).toBe(source)
  })
  it("keeps the referrer HOST only — never the path or query", () => {
    expect(classifyReferrer("https://www.google.com/search?q=secret", null).referrer).toBe("google.com")
    expect(classifyReferrer("https://l.instagram.com/some/private/profile", null).referrer).toBe("l.instagram.com")
  })
  it("stores no referrer for internal or direct", () => {
    expect(classifyReferrer("https://khatpodcast.com/x?y=1", null).referrer).toBeNull()
    expect(classifyReferrer(undefined, null).referrer).toBeNull()
  })
})

describe("buildPageView", () => {
  it("records a real view with source + device and NO raw IP or UA anywhere", () => {
    const out = buildPageView(input())
    expect("row" in out).toBe(true)
    if (!("row" in out)) return
    expect(out.row.page_path).toBe("/episodes/abc")
    expect(out.row.event_type).toBe("page_view")
    expect(out.row.event_data).toEqual({ source: "google", device: "mobile" })
    expect(out.row.user_agent).toBe("mobile")
    expect(out.row.visitor_id).toHaveLength(VISITOR_ID_LENGTH)
    expect(out.row.referrer).toBe("google.com")
    const serialized = JSON.stringify(out.row)
    expect(serialized).not.toContain(IP)
    expect(serialized).not.toContain("iPhone OS")
  })

  it("skips Do-Not-Track and Global Privacy Control", () => {
    expect(buildPageView(input({ dnt: "1" }))).toEqual({ skip: "privacy_signal" })
    expect(buildPageView(input({ gpc: "1" }))).toEqual({ skip: "privacy_signal" })
  })
  it("does not count staff (admin session cookie)", () => {
    expect(buildPageView(input({ hasAdminSession: true }))).toEqual({ skip: "admin" })
  })
  it("does not count bots", () => {
    expect(buildPageView(input({ userAgent: "Googlebot/2.1" }))).toEqual({ skip: "bot" })
    expect(buildPageView(input({ userAgent: null }))).toEqual({ skip: "bot" })
  })
  it("drops non-public paths and junk bodies", () => {
    expect(buildPageView(input({ body: { path: "/admin/ops" } }))).toEqual({ skip: "untracked_path" })
    expect(buildPageView(input({ body: { path: "/prepare/tok" } }))).toEqual({ skip: "untracked_path" })
    expect(buildPageView(input({ body: null }))).toEqual({ skip: "bad_body" })
    expect(buildPageView(input({ body: { path: 7 } }))).toEqual({ skip: "bad_body" })
  })
  it("records nothing without a secret (an unsalted IP hash is reversible)", () => {
    expect(buildPageView(input({ secret: null }))).toEqual({ skip: "no_secret" })
  })
})

describe("visitor id rotates by Kuwait day", () => {
  const base = { secret: "s", ip: IP, userAgent: IPHONE }
  it("is stable within a day", () => {
    const a = buildPageView(input({ now: new Date("2026-10-02T06:00:00Z") }))
    const b = buildPageView(input({ now: new Date("2026-10-02T20:00:00Z") }))
    expect("row" in a && "row" in b && a.row.visitor_id === b.row.visitor_id).toBe(true)
  })
  it("changes the next day", () => {
    expect(visitorId({ ...base, day: "2026-10-02" })).not.toBe(visitorId({ ...base, day: "2026-10-03" }))
  })
  it("uses the Kuwait calendar, not UTC (22:00Z is already tomorrow in Kuwait)", () => {
    expect(kuwaitDay(new Date("2026-10-02T20:59:00Z"))).toBe("2026-10-02")
    expect(kuwaitDay(new Date("2026-10-02T21:00:00Z"))).toBe("2026-10-03")
  })
  it("differs by secret, IP and user-agent", () => {
    const id = visitorId({ ...base, day: "2026-10-02" })
    expect(visitorId({ ...base, secret: "other", day: "2026-10-02" })).not.toBe(id)
    expect(visitorId({ ...base, ip: "203.0.113.78", day: "2026-10-02" })).not.toBe(id)
    expect(visitorId({ ...base, userAgent: MAC, day: "2026-10-02" })).not.toBe(id)
  })
})

describe("rate-limit key — IPv6 by /64", () => {
  it("collapses addresses in one /64 to one key", () => {
    const a = rateLimitKey("2001:db8:abcd:12:1::1")
    expect(a).toBe("2001:db8:abcd:12::/64")
    expect(rateLimitKey("2001:0db8:abcd:0012:ffff:ffff:ffff:ffff")).toBe(a)
    expect(rateLimitKey("[2001:db8:abcd:12::99]")).toBe(a)
  })
  it("keeps different /64s apart", () => {
    expect(rateLimitKey("2001:db8:abcd:13::1")).not.toBe(rateLimitKey("2001:db8:abcd:12::1"))
  })
  it("expands a :: inside the first four groups", () => {
    expect(rateLimitKey("2001:db8::1")).toBe("2001:db8:0:0::/64")
  })
  it("keeps IPv4 and IPv4-mapped IPv6 per address", () => {
    expect(rateLimitKey("203.0.113.7")).toBe("203.0.113.7")
    expect(rateLimitKey("::ffff:203.0.113.7")).toBe("203.0.113.7")
  })
  it("passes junk through unchanged", () => {
    expect(rateLimitKey("unknown")).toBe("unknown")
  })
})

describe("global insert cap", () => {
  it("allows exactly the cap per window, then refuses, then resets", () => {
    resetGlobalInsertCap()
    const t = 1_000_000
    for (let i = 0; i < GLOBAL_INSERT_CAP.max; i++) expect(takeGlobalInsertSlot(t + i)).toBe(true)
    expect(takeGlobalInsertSlot(t + 1000)).toBe(false)
    expect(takeGlobalInsertSlot(t + GLOBAL_INSERT_CAP.windowMs)).toBe(true)
    resetGlobalInsertCap()
  })
})
