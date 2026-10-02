/**
 * POST /api/track — the collector's I/O shell. The DB is mocked; the real
 * `validateOrigin`, `checkIpRateLimit` and `getClientIp` run.
 *
 * Contract: always 204, never throws, exactly one INSERT for a real view, and
 * the inserted row never carries the raw IP or the raw user-agent.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

const values = vi.fn(async () => undefined)
const insert = vi.fn(() => ({ values }))
vi.mock("@/lib/db", () => ({ db: { insert: (...a: unknown[]) => insert(...(a as [])) } }))

import { POST } from "@/app/api/track/route"
import { TRACK_RATE_LIMIT, MAX_BODY_BYTES, GLOBAL_INSERT_CAP, resetGlobalInsertCap } from "@/lib/analytics/visitor"

const UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"

let ipSeq = 0
function req(opts: {
  body?: unknown
  rawBody?: string
  headers?: Record<string, string>
  ip?: string
} = {}) {
  const ip = opts.ip ?? `198.51.100.${++ipSeq % 250}`
  return new NextRequest("http://localhost:3000/api/track", {
    method: "POST",
    body: opts.rawBody ?? JSON.stringify(opts.body ?? { path: "/", referrer: "https://t.co/x" }),
    headers: {
      host: "localhost:3000",
      origin: "http://localhost:3000",
      "user-agent": UA,
      "x-real-ip": ip,
      "content-type": "application/json",
      ...opts.headers,
    },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  resetGlobalInsertCap()
  process.env.ANALYTICS_SALT_SECRET = "test-secret"
})

describe("POST /api/track", () => {
  it("records a real public view as ONE insert, with no raw IP or UA", async () => {
    const res = await POST(req({ ip: "203.0.113.9" }))
    expect(res.status).toBe(204)
    expect(insert).toHaveBeenCalledTimes(1)
    const row = (values.mock.calls[0] as unknown[])[0] as Record<string, unknown>
    expect(row.page_path).toBe("/")
    expect(row.event_data).toEqual({ source: "x", device: "mobile" })
    const s = JSON.stringify(row)
    expect(s).not.toContain("203.0.113.9")
    expect(s).not.toContain("iPhone OS")
  })

  it("drops a cross-origin request (validateOrigin)", async () => {
    const res = await POST(req({ headers: { origin: "https://evil.example" } }))
    expect(res.status).toBe(204)
    expect(insert).not.toHaveBeenCalled()
  })

  it("drops a bot", async () => {
    await POST(req({ headers: { "user-agent": "Mozilla/5.0 (compatible; Googlebot/2.1)" } }))
    expect(insert).not.toHaveBeenCalled()
  })

  it("does not count staff carrying the admin session cookie", async () => {
    await POST(req({ headers: { cookie: "__admin_session=abc" } }))
    expect(insert).not.toHaveBeenCalled()
  })

  it("honours DNT and Sec-GPC", async () => {
    await POST(req({ headers: { dnt: "1" } }))
    await POST(req({ headers: { "sec-gpc": "1" } }))
    expect(insert).not.toHaveBeenCalled()
  })

  it("drops non-public paths", async () => {
    await POST(req({ body: { path: "/prepare/secret-token" } }))
    await POST(req({ body: { path: "/admin/ops" } }))
    expect(insert).not.toHaveBeenCalled()
  })

  it("drops oversized and malformed bodies", async () => {
    await POST(req({ rawBody: JSON.stringify({ path: "/", pad: "x".repeat(MAX_BODY_BYTES) }) }))
    await POST(req({ rawBody: "{not json" }))
    expect(insert).not.toHaveBeenCalled()
  })

  it("rate-limits per IP and still answers 204", async () => {
    const ip = "192.0.2.200"
    for (let i = 0; i < TRACK_RATE_LIMIT.max; i++) await POST(req({ ip }))
    expect(insert).toHaveBeenCalledTimes(TRACK_RATE_LIMIT.max)
    const res = await POST(req({ ip }))
    expect(res.status).toBe(204)
    expect(insert).toHaveBeenCalledTimes(TRACK_RATE_LIMIT.max)
  })

  it("never throws to the client when the insert fails", async () => {
    values.mockRejectedValueOnce(new Error("too many clients"))
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    const res = await POST(req())
    expect(res.status).toBe(204)
    spy.mockRestore()
  })

  it("records nothing without ANALYTICS_SALT_SECRET — no fallback — and warns once per process", async () => {
    const saved = { a: process.env.ANALYTICS_SALT_SECRET, n: process.env.NEWSLETTER_TRACKING_SECRET, r: process.env.RESEND_API_KEY }
    delete process.env.ANALYTICS_SALT_SECRET
    process.env.NEWSLETTER_TRACKING_SECRET = "present"
    process.env.RESEND_API_KEY = "present"
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    try {
      const res = await POST(req())
      expect(res.status).toBe(204)
      await POST(req())
      await POST(req())
      expect(insert).not.toHaveBeenCalled()
      // Not silent — but ONE warning per process, not one per page view.
      const hits = warn.mock.calls.filter((c) => String(c[0]).includes("ANALYTICS_SALT_SECRET"))
      expect(hits).toHaveLength(1)
    } finally {
      warn.mockRestore()
      for (const [k, v] of [["ANALYTICS_SALT_SECRET", saved.a], ["NEWSLETTER_TRACKING_SECRET", saved.n], ["RESEND_API_KEY", saved.r]] as const) {
        if (v === undefined) delete process.env[k]
        else process.env[k] = v
      }
    }
  })

  it("rate-limits an IPv6 client by its /64, not per address", async () => {
    for (let i = 0; i < TRACK_RATE_LIMIT.max; i++) await POST(req({ ip: `2001:db8:77:1::${(i + 1).toString(16)}` }))
    expect(insert).toHaveBeenCalledTimes(TRACK_RATE_LIMIT.max)
    await POST(req({ ip: "2001:db8:77:1:ffff::1" })) // same /64, fresh address
    expect(insert).toHaveBeenCalledTimes(TRACK_RATE_LIMIT.max)
    await POST(req({ ip: "2001:db8:77:2::1" })) // next /64
    expect(insert).toHaveBeenCalledTimes(TRACK_RATE_LIMIT.max + 1)
  })

  it("stops writing past the per-process global cap, still answering 204", async () => {
    // Distinct IPs, so only the GLOBAL cap can be what stops the writes.
    for (let i = 0; i < GLOBAL_INSERT_CAP.max; i++) await POST(req({ ip: `10.${(i >> 8) & 255}.${i & 255}.9` }))
    expect(insert).toHaveBeenCalledTimes(GLOBAL_INSERT_CAP.max)
    const res = await POST(req({ ip: "10.250.250.250" }))
    expect(res.status).toBe(204)
    expect(insert).toHaveBeenCalledTimes(GLOBAL_INSERT_CAP.max)
  })
})
