/**
 * «زوار الموقع» read side: the window totals, gap-filled series, labels and
 * source buckets (pure `deriveVisitorStats`), the SQL's load-bearing
 * predicates, and `getVisitorRaw`'s null-on-failure contract.
 */
import { describe, it, expect, vi } from "vitest"

const execute = vi.fn()
vi.mock("@/lib/db", () => ({ db: { execute: (...a: unknown[]) => execute(...a) } }))

import { PgDialect } from "drizzle-orm/pg-core"
import {
  deriveVisitorStats,
  getVisitorRaw,
  shiftDay,
  VISITOR_STATS_SQL,
  VISITOR_WINDOW_DAYS,
  type VisitorRaw,
} from "@/lib/analytics/stats"

const RAW: VisitorRaw = {
  today: "2026-10-02",
  firstDay: "2026-09-01",
  daily: [
    { day: "2026-09-01", views: 100, visitors: 50 }, // outside 30d (day 31)
    { day: "2026-09-03", views: 10, visitors: 5 }, // first day of the 30d window
    { day: "2026-09-26", views: 7, visitors: 4 }, // exactly 6 days back → in 7d
    { day: "2026-09-25", views: 3, visitors: 2 }, // 7 days back → NOT in 7d
    { day: "2026-10-02", views: 9, visitors: 6 },
  ],
  pages: [
    { path: "/", title: null, views: 20, visitors: 10 },
    { path: "/episodes/x", title: "قصة كذا | بودكاست خط", views: 5, visitors: 3 },
    { path: "/guests/y", title: "فلان", views: 4, visitors: 2 },
    { path: "/topics/z", title: null, views: 1, visitors: 1 },
    { path: "/episodes/<script>", title: null, views: 1, visitors: 1 }, // fails the slug rule
    { path: "/admin/ops", title: null, views: 1, visitors: 1 }, // not public
  ],
  sources: [
    { source: "google", views: 4 },
    { source: "internal", views: 99 },
    { source: "weird", views: 2 },
    { source: "other", views: 1 },
  ],
}

describe("deriveVisitorStats", () => {
  const s = deriveVisitorStats(RAW)

  it("fills exactly 30 Kuwait days, oldest first, ending today", () => {
    expect(s.series).toHaveLength(VISITOR_WINDOW_DAYS)
    expect(s.series[0].day).toBe("2026-09-03")
    expect(s.series.at(-1)!.day).toBe("2026-10-02")
    expect(s.series.find((p) => p.day === "2026-09-10")).toEqual({ day: "2026-09-10", views: 0, visitors: 0 })
  })

  it("derives today / 7d / 30d from the same series", () => {
    expect(s.today).toEqual({ views: 9, visitors: 6 })
    expect(s.week).toEqual({ views: 16, visitors: 10 })
    expect(s.month).toEqual({ views: 29, visitors: 17 })
  })

  it("labels pages: episode title without the brand stamp, guest name, fixed page, raw path", () => {
    expect(s.topPages.map((p) => p.label)).toEqual(["الرئيسية", "قصة كذا", "فلان", "/topics/z"])
  })

  it("never shows a path that fails validation — not even raw", () => {
    expect(s.topPages.map((p) => p.path)).not.toContain("/episodes/<script>")
    expect(s.topPages.map((p) => p.path)).not.toContain("/admin/ops")
  })

  it("strips the brand stamp from a /stories title too", () => {
    const out = deriveVisitorStats({
      ...RAW,
      pages: [{ path: "/stories/x", title: "قصة كذا | بودكاست خط", views: 1, visitors: 1 }],
    })
    expect(out.topPages[0].label).toBe("قصة كذا")
  })

  it("drops internal navigation from sources and folds unknown buckets into «other»", () => {
    expect(s.topSources).toEqual([
      { source: "google", views: 4 },
      { source: "other", views: 3 },
    ])
  })

  it("shiftDay crosses month boundaries", () => {
    expect(shiftDay("2026-10-01", 1)).toBe("2026-09-30")
  })
})

describe("VISITOR_STATS_SQL", () => {
  const { sql: text, params } = new PgDialect().sqlToQuery(VISITOR_STATS_SQL)
  it("reads page views only, in Asia/Kuwait days", () => {
    expect(params).toContain("page_view")
    expect(params).toContain("Asia/Kuwait")
    expect(text).toContain("date_trunc('day', now() AT TIME ZONE")
  })
  it("is ONE statement with all four reads", () => {
    for (const col of ["AS today", "AS first_day", "AS daily", "AS pages", "AS sources"]) expect(text).toContain(col)
    expect(text).not.toMatch(/;\s*\S/)
  })
  it("resolves titles for episodes (and their /stories alias), guests, topics and quotes", () => {
    expect(text).toContain("'/stories/' || ep.slug")
    expect(text).toContain("LEFT JOIN guests g")
    expect(text).toContain("LEFT JOIN topics tp ON p.page_path = '/topics/' || tp.slug")
    expect(text).toContain("LEFT JOIN home_quotes q ON p.page_path = '/quotes/' || q.id")
  })

  it("excludes internal navigation from sources", () => {
    expect(text).toContain("<> 'internal'")
  })
})

describe("getVisitorRaw", () => {
  it("returns null (never zeros) when the query fails", async () => {
    execute.mockRejectedValueOnce(new Error("boom"))
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    expect(await getVisitorRaw()).toBeNull()
    spy.mockRestore()
  })
  it("maps the row", async () => {
    execute.mockResolvedValueOnce({ rows: [{ today: "2026-10-02", first_day: null, daily: [], pages: [], sources: [] }] })
    expect(await getVisitorRaw()).toEqual({ today: "2026-10-02", firstDay: null, daily: [], pages: [], sources: [] })
  })
})
