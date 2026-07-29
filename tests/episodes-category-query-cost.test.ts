/**
 * Regression: the category lookup must be a cost the caller opted into.
 *
 * `loadCategoryMap()` was added unconditionally to the `Promise.all` in
 * applyListPipeline, so EVERY getEpisodes() call paid an extra SELECT —
 * including the ones that never look at a category: /api/episodes, the
 * admin episode/guest/studio lists, the newsletter builder. Measured at
 * ~0.90 extra queries per /api/episodes call, up from zero.
 *
 * The map is genuinely needed in exactly two cases, and this pins both:
 *   • filtering by category — impossible without it;
 *   • a caller that renders category badges and says so.
 *
 * The first test fails against the pre-fix code (the lookup ran anyway).
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

import { mockDb, mockSelectResult, resetMock } from "./db-mock"
import { makeEpisode } from "./fixtures"

const { mockGetCategoriesForRequest } = vi.hoisted(() => {
  delete process.env.YOUTUBE_API_KEY
  return {
    mockGetCategoriesForRequest: vi.fn().mockResolvedValue([
      { id: "cat-1", name: "فكر", slug: "fikr", sort_order: 1 },
    ]),
  }
})

vi.mock("@/lib/db", () => ({ db: mockDb, pool: {}, USE_DB: true }))
vi.mock("@/lib/cache/episode-cache", () => ({
  getCachedEpisodes: vi.fn().mockRejectedValue(new Error("YouTube disabled")),
}))
vi.mock("@/lib/youtube/queries", () => ({
  fetchEpisodeBySlug: vi.fn().mockResolvedValue(null),
  fetchMostViewedRecent: vi.fn().mockResolvedValue(null),
  fetchAllEpisodes: vi.fn().mockResolvedValue([]),
}))
vi.mock("@/lib/episodes/overrides", () => ({
  getEpisodeOverrides: vi.fn().mockResolvedValue([]),
  applyOverrides: vi.fn().mockImplementation((eps: unknown[]) => eps),
}))
vi.mock("@/lib/episodes/deleted", () => ({
  getDeletedEpisodeIds: vi.fn().mockResolvedValue(new Set<string>()),
  listDeletedEpisodeIds: vi.fn().mockResolvedValue([]),
}))
// The category lookup this test is about. Counting calls here counts the
// SELECT, without depending on the shared FIFO db-mock ordering.
vi.mock("@/lib/queries/categories", () => ({
  getCategoriesForRequest: mockGetCategoriesForRequest,
}))

import { getEpisodes } from "@/lib/queries/episodes"

function queueEpisodeList() {
  const ep = makeEpisode({ id: "ep-1", category_id: "cat-1" })
  mockSelectResult([
    {
      episodes: {
        ...ep,
        created_at: new Date(ep.created_at),
        updated_at: new Date(),
      },
      guests: null,
    },
  ] as Record<string, unknown>[])
  mockSelectResult([]) // hidden episode ids
}

describe("getEpisodes — category lookup is opt-in", () => {
  beforeEach(() => {
    resetMock()
    mockGetCategoriesForRequest.mockClear()
  })

  it("does NOT query categories for a plain listing", async () => {
    queueEpisodeList()

    const result = await getEpisodes({})

    expect(result).toHaveLength(1)
    expect(mockGetCategoriesForRequest).not.toHaveBeenCalled()
  })

  it("does NOT query categories for the admin list shape", async () => {
    queueEpisodeList()

    await getEpisodes({ limit: 200, includeHidden: true })

    expect(mockGetCategoriesForRequest).not.toHaveBeenCalled()
  })

  it("does NOT query categories for a search-only request", async () => {
    queueEpisodeList()

    await getEpisodes({ search: "خط" })

    expect(mockGetCategoriesForRequest).not.toHaveBeenCalled()
  })

  it("queries categories once when the caller asks for badges", async () => {
    queueEpisodeList()

    const result = await getEpisodes({ withCategories: true })

    expect(mockGetCategoriesForRequest).toHaveBeenCalledTimes(1)
    expect(result[0].category).toEqual({
      id: "cat-1",
      name: "فكر",
      slug: "fikr",
      sort_order: 1,
    })
  })

  it("queries categories when filtering by category, without the flag", async () => {
    queueEpisodeList()

    const result = await getEpisodes({ category: "fikr" })

    expect(mockGetCategoriesForRequest).toHaveBeenCalledTimes(1)
    // Filtering still works — the episode is in that category.
    expect(result.map((e) => e.id)).toEqual(["ep-1"])
  })
})
