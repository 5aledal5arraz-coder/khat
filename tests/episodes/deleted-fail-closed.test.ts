/**
 * The tombstone read must FAIL CLOSED, like the hidden set.
 *
 * Production, 2026-10-02: the sitemap listed 77 episode URLs, 36 of which
 * answered 404 — exactly the 36 rows in `deleted_episodes`. The public list
 * was built once WITHOUT the tombstone filter and served from cache, while
 * every episode page (read fresh) blocked the same ids. A tombstone read that
 * errors used to return an EMPTY set ("nothing is deleted"), which publishes
 * every deleted episode for as long as that list is cached. The uncached
 * /api/episodes measured 41 at the same time — the 36 were never meant to be
 * public.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { mockDb, mockSelectResult, mockSelectRejection, resetMock } from "../db-mock"

vi.mock("@/lib/db", () => ({ db: mockDb, pool: {}, USE_DB: true }))

async function fresh() {
  vi.resetModules()
  return import("@/lib/episodes/deleted")
}

beforeEach(() => resetMock())

describe("getDeletedEpisodeIds", () => {
  it("reads the tombstones (positive control)", async () => {
    const { getDeletedEpisodeIds } = await fresh()
    mockSelectResult([{ episode_id: "a" }, { episode_id: "b" }])
    expect([...(await getDeletedEpisodeIds())]).toEqual(["a", "b"])
  })

  it("a DB error with no previous read does NOT mean 'nothing is deleted'", async () => {
    const { getDeletedEpisodeIds } = await fresh()
    mockSelectRejection(new Error("ETIMEDOUT"))
    await expect(getDeletedEpisodeIds()).rejects.toThrow()
  })

  it("a DB error after a good read reuses the last known set", async () => {
    const { getDeletedEpisodeIds } = await fresh()
    mockSelectResult([{ episode_id: "a" }])
    await getDeletedEpisodeIds()
    mockSelectRejection(new Error("ETIMEDOUT"))
    expect([...(await getDeletedEpisodeIds())]).toEqual(["a"])
  })

  it("the admin list view still degrades to [] instead of crashing the page", async () => {
    const { listDeletedEpisodeIds } = await fresh()
    mockSelectRejection(new Error("ETIMEDOUT"))
    expect(await listDeletedEpisodeIds()).toEqual([])
  })
})
