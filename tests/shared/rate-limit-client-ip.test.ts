/**
 * The per-IP limiter must key on the address OUR proxy saw, not on what the
 * client claims. nginx appends the real peer to X-Forwarded-For and overwrites
 * X-Real-IP, so the first XFF entry is attacker-controlled.
 */

import { describe, expect, it } from "vitest"
import { checkIpRateLimit, getClientIp } from "@/lib/rate-limit"

function src(h: Record<string, string>) {
  const lower = Object.fromEntries(Object.entries(h).map(([k, v]) => [k.toLowerCase(), v]))
  return { headers: { get: (n: string) => lower[n.toLowerCase()] ?? null } }
}

describe("getClientIp", () => {
  it("prefers x-real-ip over any x-forwarded-for", () => {
    expect(getClientIp(src({ "x-real-ip": "203.0.113.7", "x-forwarded-for": "1.1.1.1, 203.0.113.7" }))).toBe(
      "203.0.113.7",
    )
  })

  it("ignores a spoofed FIRST xff entry and takes the hop our proxy appended", () => {
    expect(getClientIp(src({ "x-forwarded-for": "6.6.6.6, 198.51.100.4" }))).toBe("198.51.100.4")
    expect(getClientIp(src({ "x-forwarded-for": " 6.6.6.6 ,  , 198.51.100.4 " }))).toBe("198.51.100.4")
  })

  it("single entry, and nothing at all", () => {
    expect(getClientIp(src({ "x-forwarded-for": "198.51.100.4" }))).toBe("198.51.100.4")
    expect(getClientIp(src({}))).toBe("unknown")
    expect(getClientIp(src({ "x-real-ip": "  ", "x-forwarded-for": " , " }))).toBe("unknown")
  })
})

describe("checkIpRateLimit — rotating a spoofed first entry no longer resets the bucket", () => {
  it("same real IP behind nginx is limited however the first entry changes", () => {
    const action = `spoof_test_${Date.now()}`
    const results = Array.from({ length: 4 }, (_, i) =>
      checkIpRateLimit(
        src({ "x-forwarded-for": `10.66.0.${i}, 198.51.100.9`, "x-real-ip": "198.51.100.9" }),
        action,
        3,
        60_000,
      ).allowed,
    )
    expect(results).toEqual([true, true, true, false])
  })

  it("without x-real-ip the last hop still pins the bucket", () => {
    const action = `spoof_test_xff_${Date.now()}`
    const results = Array.from({ length: 3 }, (_, i) =>
      checkIpRateLimit(src({ "x-forwarded-for": `10.77.0.${i}, 198.51.100.10` }), action, 2, 60_000).allowed,
    )
    expect(results).toEqual([true, true, false])
  })
})
