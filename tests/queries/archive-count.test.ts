/**
 * Wave 3 — `countArchiveEpisodes()`.
 *
 * The «حلقات منشورة» tile used to call `getEpisodes({}).then(e => e.length)`:
 * a `SELECT *` over `episodes` LEFT JOIN `guests` (every guest column,
 * contact fields included, materialised to be counted and thrown away),
 * three more id-set queries, and — whenever the 12h cache had expired — a
 * live YouTube Data API call ON THE RENDER PATH.
 *
 * Replacing that with a count is only safe if the count means the same
 * thing, so this file pins the arithmetic rather than the SQL:
 *   • every YouTube episode counts;
 *   • a DB episode counts only when YouTube doesn't already have that id
 *     AND it has a non-empty title and youtube_url — the guard
 *     `mergeEpisodeLists` applies before pushing a DB-only row. A plain
 *     `COUNT(*) FROM episodes` gets this wrong in both directions.
 *   • hidden and tombstoned ids are excluded from both sides;
 *   • an unreadable count is `null`, never `0`.
 *   • reading the count NEVER refreshes the YouTube cache.
 */

import { describe, expect, it, vi, beforeEach, afterAll } from "vitest"

const execute = vi.fn()
vi.mock("@/lib/db", () => ({
  db: { execute: (...a: unknown[]) => execute(...a) },
  pool: null,
  USE_DB: true,
}))

const peekCachedEpisodes = vi.fn()
const getCachedEpisodes = vi.fn()
vi.mock("@/lib/cache/episode-cache", () => ({
  peekCachedEpisodes: () => peekCachedEpisodes(),
  getCachedEpisodes: () => getCachedEpisodes(),
}))

vi.mock("@/lib/env", () => ({ env: { YOUTUBE_API_KEY: "test-key" } }))

import { countArchiveEpisodes } from "@/lib/queries/episodes"

const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
afterAll(() => errorSpy.mockRestore())
beforeEach(() => {
  vi.clearAllMocks()
  peekCachedEpisodes.mockResolvedValue({ episodes: [], stale: false, fetchedAt: null })
})

const yt = (...ids: string[]) => ({
  episodes: ids.map((id) => ({ id })),
  stale: false,
  fetchedAt: new Date().toISOString(),
})

describe("countArchiveEpisodes", () => {
  it("sums the YouTube side and the DB-only side", async () => {
    peekCachedEpisodes.mockResolvedValue(yt("a", "b", "c"))
    execute.mockResolvedValue({ rows: [{ yt_n: 3, db_n: 2 }] })

    const out = await countArchiveEpisodes()
    expect(out).toEqual({ count: 5, source: "merged", stale: false })
  })

  it("runs exactly ONE query for the merged count", async () => {
    peekCachedEpisodes.mockResolvedValue(yt("a"))
    execute.mockResolvedValue({ rows: [{ yt_n: 1, db_n: 0 }] })

    await countArchiveEpisodes()
    expect(execute).toHaveBeenCalledTimes(1)
  })

  it("never refreshes the YouTube cache — no API call on the render path", async () => {
    peekCachedEpisodes.mockResolvedValue(yt("a", "b"))
    execute.mockResolvedValue({ rows: [{ yt_n: 2, db_n: 0 }] })

    await countArchiveEpisodes()
    expect(peekCachedEpisodes).toHaveBeenCalled()
    expect(getCachedEpisodes).not.toHaveBeenCalled()
  })

  it("reports a stale YouTube snapshot instead of silently refreshing it", async () => {
    peekCachedEpisodes.mockResolvedValue({
      episodes: [{ id: "a" }],
      stale: true,
      fetchedAt: "2020-01-01T00:00:00.000Z",
    })
    execute.mockResolvedValue({ rows: [{ yt_n: 1, db_n: 0 }] })

    const out = await countArchiveEpisodes()
    expect(out?.stale).toBe(true)
    expect(getCachedEpisodes).not.toHaveBeenCalled()
  })

  it("falls back to the DB-only definition when the cache is cold, and SAYS so", async () => {
    peekCachedEpisodes.mockResolvedValue({ episodes: [], stale: true, fetchedAt: null })
    execute.mockResolvedValue({ rows: [{ n: 7 }] })

    const out = await countArchiveEpisodes()
    // `source: "db"` is what lets the tile relabel itself — the DB-only
    // archive is a genuinely smaller set and must not wear the merged label.
    expect(out).toEqual({ count: 7, source: "db", stale: false })
  })

  it("falls back to DB-only when the cache peek itself throws", async () => {
    peekCachedEpisodes.mockRejectedValue(new Error("cache unreadable"))
    execute.mockResolvedValue({ rows: [{ n: 4 }] })

    const out = await countArchiveEpisodes()
    expect(out).toEqual({ count: 4, source: "db", stale: false })
  })

  it("returns null — not 0 — when the count query fails", async () => {
    peekCachedEpisodes.mockResolvedValue(yt("a"))
    execute.mockRejectedValue(new Error("connection reset"))

    // 0 would render as a confident «٠ حلقات منشورة»; the tile renders
    // null as «—». Failing closed to a real number is the worse lie.
    expect(await countArchiveEpisodes()).toBeNull()
  })

  it("treats a missing result row as zero rather than NaN", async () => {
    peekCachedEpisodes.mockResolvedValue(yt("a"))
    execute.mockResolvedValue({ rows: [] })

    const out = await countArchiveEpisodes()
    expect(out).toEqual({ count: 0, source: "merged", stale: false })
  })

  it("passes the YouTube ids to the query so DB-only rows can be deduped", async () => {
    peekCachedEpisodes.mockResolvedValue(yt("vid1", "vid2"))
    execute.mockResolvedValue({ rows: [{ yt_n: 2, db_n: 0 }] })

    await countArchiveEpisodes()
    const params = JSON.stringify(execute.mock.calls[0]?.[0] ?? {})
    expect(params).toContain("vid1")
    expect(params).toContain("vid2")
  })

  it("excludes hidden and tombstoned ids on BOTH sides of the union", async () => {
    peekCachedEpisodes.mockResolvedValue(yt("a"))
    execute.mockResolvedValue({ rows: [{ yt_n: 0, db_n: 0 }] })

    await countArchiveEpisodes()
    const sqlText = JSON.stringify(execute.mock.calls[0]?.[0] ?? {})
    expect(sqlText).toContain("hidden_episodes")
    expect(sqlText).toContain("deleted_episodes")
    // NOT IN against a nullable set silently returns nothing; the query
    // must use NOT EXISTS.
    expect(sqlText).toContain("NOT EXISTS")
  })

  it("guards DB-only rows on non-empty title and youtube_url", async () => {
    peekCachedEpisodes.mockResolvedValue(yt("a"))
    execute.mockResolvedValue({ rows: [{ yt_n: 1, db_n: 0 }] })

    await countArchiveEpisodes()
    const sqlText = JSON.stringify(execute.mock.calls[0]?.[0] ?? {})
    expect(sqlText).toContain("title")
    expect(sqlText).toContain("youtube_url")
  })
})
