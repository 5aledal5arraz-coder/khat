/**
 * Topic-engine defect #15 — «حديثة» on week-old data. Anything between 48h and
 * 7 days was classified "fresh", so the season card showed the green «حديثة»
 * badge with the line "updated within the last 48 hours" on data up to a week
 * old (prod on 2026-10-03: last collect 2026-09-25).
 */
import { describe, it, expect } from "vitest"
import { classifyMarketFreshness } from "@/lib/market-intelligence/freshness"

const NOW = Date.parse("2026-10-03T00:00:00Z")
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString()

describe("classifyMarketFreshness", () => {
  it("is fresh within 48h", () => {
    expect(classifyMarketFreshness(10, hoursAgo(47), NOW)).toEqual({ status: "fresh", ageHours: 47 })
  })

  it("is NOT fresh between 48h and 7 days (was reported «حديثة»)", () => {
    expect(classifyMarketFreshness(10, hoursAgo(72), NOW).status).toBe("aging")
    expect(classifyMarketFreshness(10, hoursAgo(6 * 24 + 23), NOW).status).toBe("aging")
  })

  it("is stale from 7 days (prod 2026-10-03: ~7.95 days)", () => {
    expect(classifyMarketFreshness(5630, hoursAgo(191), NOW)).toEqual({ status: "stale", ageHours: 191 })
  })

  it("is empty with no signals, and stale when no timestamp exists at all", () => {
    expect(classifyMarketFreshness(0, null, NOW)).toEqual({ status: "empty", ageHours: null })
    expect(classifyMarketFreshness(3, null, NOW)).toEqual({ status: "stale", ageHours: null })
  })
})
