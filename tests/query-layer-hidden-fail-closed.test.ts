/**
 * Query layer tests: the hidden-episode lookup must FAIL CLOSED.
 *
 * `hidden_episodes` is a visibility control. Before this was fixed,
 * `getHiddenEpisodeIds()` swallowed every DB error and returned an empty
 * Set — which the pipeline reads as "nothing is hidden", so a transient
 * Postgres failure silently PUBLISHED every deliberately-hidden episode.
 *
 * The exposure is real rather than theoretical: the public episode list is
 * still served from the YouTube/JSON fallbacks while Postgres is
 * unreachable, so the list renders fully populated while the hidden filter
 * is quietly a no-op. An ETIMEDOUT on a cold start hit exactly this path.
 *
 * Each test re-imports the module so the last-known-good cache inside
 * `lib/queries/episodes.ts` starts empty and cannot leak across cases.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

import { mockDb, mockSelectResult, mockSelectRejection, resetMock } from "./db-mock"
import { testEpisodes, makeEpisode } from "./fixtures"

const { mockGetEpisodeOverrides, mockApplyOverrides } = vi.hoisted(() => {
  // Match query-layer-db-only.test.ts: `.env.local` sets YOUTUBE_API_KEY for
  // normal dev runs, which would flip USE_YOUTUBE=true at module-load time
  // and send resolveAllEpisodes down the YouTube path.
  delete process.env.YOUTUBE_API_KEY
  return {
    mockGetEpisodeOverrides: vi.fn().mockResolvedValue([]),
    mockApplyOverrides: vi
      .fn()
      .mockImplementation((episodes: unknown[]) => episodes),
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
  getEpisodeOverrides: mockGetEpisodeOverrides,
  applyOverrides: mockApplyOverrides,
}))
vi.mock("@/lib/episodes/enrichments", () => ({
  getEpisodeEnrichment: vi.fn().mockResolvedValue(null),
  // fetchDbEpisodeDetail() calls this inside its Promise.all — omitting it
  // makes the detail fetch throw and silently resolve to null.
  getPublicEpisodeEnrichment: vi.fn().mockResolvedValue(null),
}))
vi.mock("@/lib/episodes/quotes", () => ({
  getPublishedQuotes: vi.fn().mockResolvedValue([]),
}))
vi.mock("@/lib/episodes/merge", () => ({
  mergeEpisodeLists: vi.fn().mockImplementation((yt: unknown[], db: unknown[]) => [...yt, ...db]),
  mergeEpisode: vi.fn().mockImplementation((yt: unknown) => yt),
}))
vi.mock("@/lib/episodes/deleted", () => ({
  getDeletedEpisodeIds: vi.fn().mockResolvedValue(new Set<string>()),
  listDeletedEpisodeIds: vi.fn().mockResolvedValue([]),
}))

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Fresh module instance, so the last-known-good cache starts empty. */
async function freshQueryLayer() {
  vi.resetModules()
  return import("@/lib/queries/episodes")
}

/** Queue the joined rows that `fetchDbEpisodeList()` will read (select #1). */
function queueEpisodeList(episodes: ReturnType<typeof makeEpisode>[] = testEpisodes) {
  mockSelectResult(
    episodes.map((ep) => ({
      episodes: {
        ...ep,
        release_date: ep.release_date,
        created_at: new Date(ep.created_at),
        updated_at: ep.updated_at ? new Date(ep.updated_at) : new Date(),
      },
      guests: ep.guest
        ? { ...ep.guest, created_at: new Date(ep.guest.created_at) }
        : null,
    })) as Record<string, unknown>[],
  )
}

/**
 * Queue the flat episode row that `fetchDbEpisodeDetail()` reads for a slug.
 * ep-1 has no guest and no category, so the follow-up relation queries all
 * fall through to the mock's empty default.
 */
function queueEpisodeDetail(episode = testEpisodes[0]) {
  mockSelectResult([
    {
      ...episode,
      category_id: null,
      guest_id: null,
      created_at: new Date(episode.created_at),
      updated_at: new Date(),
    } as Record<string, unknown>,
  ])
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("getHiddenEpisodeIds — fails CLOSED on DB error", () => {
  beforeEach(() => {
    resetMock()
    mockGetEpisodeOverrides.mockResolvedValue([])
    vi.spyOn(console, "error").mockImplementation(() => {})
  })

  it("getEpisodes() returns NOTHING rather than leaking the catalogue", async () => {
    const { getEpisodes } = await freshQueryLayer()
    queueEpisodeList() // select #1 — the episode list still resolves fine
    mockSelectRejection(new Error("ETIMEDOUT")) // select #2 — hidden lookup dies

    const result = await getEpisodes()

    // The bug returned every episode here, hidden ones included.
    expect(result).toEqual([])
  })

  it("getEpisodeBySlug() blocks a resolvable episode rather than serving a possibly-hidden one", async () => {
    const { getEpisodeBySlug } = await freshQueryLayer()
    mockSelectRejection(new Error("ETIMEDOUT")) // select #1 — hidden lookup dies
    queueEpisodeDetail() // select #2 — the episode itself resolves perfectly

    const result = await getEpisodeBySlug("s1-ep1")

    // The episode IS fetchable (see the control test below). The only reason
    // to withhold it is that we cannot prove it isn't hidden.
    expect(result).toBeNull()
  })

  it("control: the same slug is served normally when the hidden lookup succeeds", async () => {
    const { getEpisodeBySlug } = await freshQueryLayer()
    mockSelectResult([]) // select #1 — hidden lookup succeeds, nothing hidden
    queueEpisodeDetail() // select #2 — same episode row as the test above

    const result = await getEpisodeBySlug("s1-ep1")

    // Proves the test above fails closed on the hidden set, not on a
    // mis-mocked episode lookup.
    expect(result).not.toBeNull()
    expect(result!.id).toBe("ep-1")
  })

  it("logs the failure loudly instead of swallowing it", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    const { getEpisodes } = await freshQueryLayer()
    queueEpisodeList()
    mockSelectRejection(new Error("ETIMEDOUT"))

    await getEpisodes()

    const logged = spy.mock.calls.map((c) => String(c[0])).join("\n")
    expect(logged).toContain("Hidden-episode lookup FAILED")
    expect(logged).toContain("failing CLOSED")
  })
})

describe("getHiddenEpisodeIds — last-known-good keeps the site up", () => {
  beforeEach(() => {
    resetMock()
    mockGetEpisodeOverrides.mockResolvedValue([])
    vi.spyOn(console, "error").mockImplementation(() => {})
  })

  it("reuses the previous hidden set on a later failure — no blackout, no leak", async () => {
    const { getEpisodes } = await freshQueryLayer()

    // 1st call succeeds and caches { ep-2 } as hidden.
    queueEpisodeList()
    mockSelectResult([{ episode_id: "ep-2" }])
    const first = await getEpisodes()
    expect(first.find((e) => e.id === "ep-2")).toBeUndefined()
    expect(first.length).toBe(testEpisodes.length - 1)

    // 2nd call: the hidden lookup fails, but we already know what was hidden.
    queueEpisodeList()
    mockSelectRejection(new Error("ETIMEDOUT"))
    const second = await getEpisodes()

    // Still serving the catalogue (not a blackout) …
    expect(second.length).toBe(testEpisodes.length - 1)
    // … and ep-2 is still hidden (not a leak).
    expect(second.find((e) => e.id === "ep-2")).toBeUndefined()
  })
})

describe("getHiddenEpisodeIds — healthy paths are untouched", () => {
  beforeEach(() => {
    resetMock()
    mockGetEpisodeOverrides.mockResolvedValue([])
  })

  it("still returns the full list when the hidden set is empty", async () => {
    const { getEpisodes } = await freshQueryLayer()
    queueEpisodeList()
    mockSelectResult([]) // no hidden episodes

    const result = await getEpisodes()

    // Guards the tests above: they must be proving fail-closed, not just
    // asserting that this pipeline always comes back empty.
    expect(result.length).toBe(testEpisodes.length)
  })

  it("includeHidden:true bypasses the hidden lookup entirely", async () => {
    const { getEpisodes } = await freshQueryLayer()
    queueEpisodeList()
    // No hidden lookup is queued — includeHidden short-circuits it.

    const result = await getEpisodes({ includeHidden: true })

    expect(result.length).toBe(testEpisodes.length)
  })
})
