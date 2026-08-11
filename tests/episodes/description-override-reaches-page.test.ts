/**
 * Regression: an admin description override must reach the public episode page.
 *
 * The YouTube path in `resolveEpisodeBySlug` derives `summary` from
 * `description` when the episode has no enrichment `full_summary`, and it does
 * that BEFORE `getEpisodeBySlug` applies the admin overrides. The episode page
 * renders `summary || description` (components/episodes/episode-page-client.tsx),
 * so the override landed on a field nothing read: the admin saved, the version
 * row was written, the caches were busted — and the live page never changed.
 *
 * These tests pin BOTH fields, because pinning only `description` is exactly the
 * assertion that passed while the page stayed stale.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

import { mockDb, mockSelectResult, resetMock } from "../db-mock"
import { makeEpisode } from "../fixtures"

const { mockGetEpisodeOverrides, mockFetchEpisodeBySlug, mockGetPublicEnrichment } =
  vi.hoisted(() => {
    // The YouTube path is what production runs — the opposite of
    // tests/query-layer-slug-lookup.test.ts, which deletes this key to exercise
    // the DB-only path. The bug lives only in the YouTube path.
    process.env.YOUTUBE_API_KEY = "test-key"
    return {
      mockGetEpisodeOverrides: vi.fn().mockResolvedValue([]),
      mockFetchEpisodeBySlug: vi.fn(),
      mockGetPublicEnrichment: vi.fn().mockResolvedValue(null),
    }
  })

vi.mock("@/lib/db", () => ({ db: mockDb, pool: {}, USE_DB: true }))
vi.mock("@/lib/cache/episode-cache", () => ({
  getCachedEpisodes: vi.fn().mockRejectedValue(new Error("not used here")),
  peekCachedEpisodes: vi.fn().mockReturnValue(null),
}))
vi.mock("@/lib/youtube/queries", () => ({
  fetchEpisodeBySlug: mockFetchEpisodeBySlug,
  fetchMostViewedRecent: vi.fn().mockResolvedValue(null),
  fetchAllEpisodes: vi.fn().mockResolvedValue([]),
}))
vi.mock("@/lib/episodes/enrichments", () => ({
  getEpisodeEnrichment: vi.fn().mockResolvedValue(null),
  getPublicEpisodeEnrichment: mockGetPublicEnrichment,
}))
vi.mock("@/lib/episodes/quotes", () => ({
  getPublishedQuotes: vi.fn().mockResolvedValue([]),
}))
vi.mock("@/lib/episodes/deleted", () => ({
  getDeletedEpisodeIds: vi.fn().mockResolvedValue(new Set<string>()),
  listDeletedEpisodeIds: vi.fn().mockResolvedValue([]),
}))
// `applyOverrides` stays REAL — it is half of the mechanism under test. Only the
// storage read is faked.
vi.mock("@/lib/episodes/overrides", async () => {
  const actual = await vi.importActual<typeof import("@/lib/episodes/overrides")>(
    "@/lib/episodes/overrides",
  )
  return { ...actual, getEpisodeOverrides: mockGetEpisodeOverrides }
})

import { getEpisodeBySlug } from "@/lib/queries/episodes"

const RAW = "الوصف الأصلي من يوتيوب\n\nهاشتاقات:\n#بودكاست_خط"
const EDITED = "الوصف بعد تحرير المحرر — بدون هاشتاقات"

/** FIFO selects consumed by the YouTube path of getEpisodeBySlug. */
function primeSelects() {
  mockSelectResult([]) // getHiddenEpisodeIds → nothing hidden
  mockSelectResult([]) // fetchDbEpisodeById → no DB row, mergeEpisode keeps YouTube
  mockSelectResult([]) // resolveEpisodeQuotes → no canonical quotes
}

beforeEach(() => {
  resetMock()
  mockGetEpisodeOverrides.mockResolvedValue([])
  mockGetPublicEnrichment.mockResolvedValue(null)
  mockFetchEpisodeBySlug.mockResolvedValue(
    makeEpisode({
      id: "ep-yt",
      slug: "test-episode",
      description: RAW,
      summary: null,
      guest_id: null,
      guest: null,
    }),
  )
})

describe("description override on the public episode page", () => {
  it("reaches BOTH the field the page reads first (summary) and description", async () => {
    mockGetEpisodeOverrides.mockResolvedValue([
      { id: "ep-yt", originalTitle: "", customTitle: "", customDescription: EDITED },
    ])
    primeSelects()

    const episode = await getEpisodeBySlug("test-episode")

    expect(episode?.description).toBe(EDITED)
    // The page renders `summary || description`. Before the fix this was RAW,
    // so the edit was invisible while `description` looked correct.
    expect(episode?.summary).toBe(EDITED)
  })

  it("BEATS a pushed enrichment summary — a human edit is the last word", async () => {
    // The rule this pins, and the trap it closes.
    //
    // The first fix only re-derived `summary` when it was a copy of the
    // pre-override description, so an episode WITH a pushed `full_summary`
    // would have gone silent again the moment Studio ran — the same bug, on a
    // delay. It did not bite only because `full_summary` is empty on all 41
    // production episodes, which is not a guarantee, it is a coincidence with
    // an expiry date.
    //
    // `runStudioPushToEpisode` writes the same text to both fields, so a push
    // loses nothing here; what it buys is that «الوصف» in the admin keeps the
    // promise its single box makes.
    const FULL_SUMMARY = "ملخص مولَّد من الاستوديو"
    mockGetPublicEnrichment.mockResolvedValue({ full_summary: FULL_SUMMARY })
    mockGetEpisodeOverrides.mockResolvedValue([
      { id: "ep-yt", originalTitle: "", customTitle: "", customDescription: EDITED },
    ])
    primeSelects()

    const episode = await getEpisodeBySlug("test-episode")

    expect(episode?.description).toBe(EDITED)
    expect(episode?.summary).toBe(EDITED)
  })

  it("keeps the enrichment summary when there is NO override to beat it", async () => {
    // The other half of the rule: nothing to override means Studio's text is
    // the page's summary, which is the whole point of pushing one.
    const FULL_SUMMARY = "ملخص مولَّد من الاستوديو"
    mockGetPublicEnrichment.mockResolvedValue({ full_summary: FULL_SUMMARY })
    primeSelects()

    const episode = await getEpisodeBySlug("test-episode")

    expect(episode?.summary).toBe(FULL_SUMMARY)
    expect(episode?.description).toBe(RAW)
  })

  it("keeps the raw description when there is no override", async () => {
    primeSelects()

    const episode = await getEpisodeBySlug("test-episode")

    expect(episode?.description).toBe(RAW)
    expect(episode?.summary).toBe(RAW)
  })
})
