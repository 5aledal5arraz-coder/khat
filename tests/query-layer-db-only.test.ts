/**
 * Query layer tests: DB-only source resolution.
 *
 * Tests getEpisodes(), getLatestEpisode(), getEpisodeCounts()
 * when YOUTUBE_API_KEY is NOT set (DB_AVAILABLE = true, USE_YOUTUBE = false).
 *
 * This is the primary production path after YouTube cache misses.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

import { mockDb, mockSelectResult, resetMock } from "./db-mock"
import { testEpisodes, testOverrides, makeEpisode } from "./fixtures"

// vi.hoisted runs before vi.mock hoisting
const { mockGetEpisodeOverrides, mockApplyOverrides } = vi.hoisted(() => {
  // The test file's mocks for `@/lib/cache/episode-cache` (mockRejectedValue)
  // and `@/lib/youtube/queries` (null returns) assume USE_YOUTUBE=false in
  // `lib/queries/episodes.ts`. `.env.local` defines YOUTUBE_API_KEY for
  // normal dev runs, which would otherwise make USE_YOUTUBE=true at
  // module-load time, sending resolveAllEpisodes down the YouTube path
  // and double-calling fetchDbEpisodeList (which drains the FIFO mock
  // queue and trips "No episode data source available"). Unset it here
  // — inside vi.hoisted so it runs above all imports — to restore the
  // env shape the tests were written against.
  delete process.env.YOUTUBE_API_KEY
  const mockGetEpisodeOverrides = vi.fn().mockResolvedValue([])
  const mockApplyOverrides = vi.fn().mockImplementation(
    (episodes: { id: string; title: string }[], overrides: { id: string; customTitle: string; customDescription?: string }[]) => {
      const map = new Map(overrides.map((o) => [o.id, o]))
      return episodes.map((ep) => {
        const o = map.get(ep.id)
        if (o) {
          const result = { ...ep, title: o.customTitle }
          if (o.customDescription) (result as Record<string, unknown>).description = o.customDescription
          return result
        }
        return ep
      })
    }
  )
  return { mockGetEpisodeOverrides, mockApplyOverrides }
})

// ── Mock all dependencies ───────────────────────────────────────────────────

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
}))
vi.mock("@/lib/episodes/quotes", () => ({
  getPublishedQuotes: vi.fn().mockResolvedValue([]),
}))
vi.mock("@/lib/episodes/merge", () => ({
  mergeEpisodeLists: vi.fn().mockImplementation((yt: unknown[], db: unknown[]) => [...yt, ...db]),
  mergeEpisode: vi.fn().mockImplementation((yt: unknown) => yt),
}))
// Tombstone module — added to lib/queries/episodes.ts after these tests
// were written. `getDeletedEpisodeIds` now runs inside every read path
// (applyListPipeline + getEpisodeBySlug); without this mock it consumes
// a FIFO slot from the shared db-mock queue, shifting downstream
// consumers off-by-one. Empty Set / array is the test default since no
// scenario in this file exercises tombstoning.
vi.mock("@/lib/episodes/deleted", () => ({
  getDeletedEpisodeIds: vi.fn().mockResolvedValue(new Set<string>()),
  listDeletedEpisodeIds: vi.fn().mockResolvedValue([]),
}))

// ── Import the module under test ────────────────────────────────────────────

import {
  getEpisodes,
  getLatestEpisode,
  getEpisodeCounts,
} from "@/lib/queries/episodes"

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Mock the full DB read flow for getEpisodes().
 * Call order inside the code:
 *   1. fetchDbEpisodeList() — db.select().from(episodes).leftJoin().orderBy()
 *   2. getHiddenEpisodeIds() — db.select().from(hiddenEpisodes)
 * Results are consumed FIFO from _selectResults.
 */
function setupGetEpisodesMocks(
  episodes: ReturnType<typeof makeEpisode>[],
  hiddenIds: string[] = []
) {
  // #1: episode list (Drizzle leftJoin returns { episodes: ..., guests: ... })
  const joinedRows = episodes.map((ep) => ({
    episodes: {
      ...ep,
      release_date: ep.release_date,
      created_at: new Date(ep.created_at),
      updated_at: ep.updated_at ? new Date(ep.updated_at) : new Date(),
    },
    guests: ep.guest
      ? { ...ep.guest, created_at: new Date(ep.guest.created_at) }
      : null,
  }))
  mockSelectResult(joinedRows as Record<string, unknown>[])

  // #2: hidden episode IDs
  mockSelectResult(hiddenIds.map((id) => ({ episode_id: id })))
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("getEpisodes — DB source, basic", () => {
  beforeEach(() => {
    resetMock()
    mockGetEpisodeOverrides.mockResolvedValue([])
  })

  it("returns all episodes from DB", async () => {
    setupGetEpisodesMocks(testEpisodes)

    const result = await getEpisodes()

    expect(result.length).toBe(testEpisodes.length)
    expect(result[0].id).toBeTruthy()
    expect(result[0].title).toBeTruthy()
    expect(result[0].slug).toBeTruthy()
    expect(result[0].youtube_url).toBeTruthy()
  })

  it("normalizes date fields to strings", async () => {
    setupGetEpisodesMocks([testEpisodes[0]])

    const result = await getEpisodes()

    expect(typeof result[0].release_date).toBe("string")
    expect(typeof result[0].created_at).toBe("string")
  })

  it("includes guest data when episode has a guest", async () => {
    const epWithGuest = testEpisodes.find((e) => e.guest_id)!
    setupGetEpisodesMocks([epWithGuest])

    const result = await getEpisodes()

    expect(result[0].guest).not.toBeNull()
    expect(result[0].guest!.name).toBeTruthy()
    expect(result[0].guest!.slug).toBeTruthy()
  })
})

describe("getEpisodes — Hidden episode filtering", () => {
  beforeEach(() => {
    resetMock()
    mockGetEpisodeOverrides.mockResolvedValue([])
  })

  it("filters out hidden episodes", async () => {
    setupGetEpisodesMocks(testEpisodes, ["ep-2"])

    const result = await getEpisodes()

    expect(result.find((e) => e.id === "ep-2")).toBeUndefined()
    expect(result.length).toBe(testEpisodes.length - 1)
  })

  it("includes hidden episodes when includeHidden is true", async () => {
    // When includeHidden=true, hiddenIds select is skipped (Promise.resolve(new Set()))
    // so we only need the episode list
    mockSelectResult(testEpisodes.map((ep) => ({
      episodes: {
        ...ep,
        release_date: ep.release_date,
        created_at: new Date(ep.created_at),
        updated_at: ep.updated_at ? new Date(ep.updated_at) : new Date(),
      },
      guests: ep.guest
        ? { ...ep.guest, created_at: new Date(ep.guest.created_at) }
        : null,
    })) as Record<string, unknown>[])

    const result = await getEpisodes({ includeHidden: true })

    expect(result.length).toBe(testEpisodes.length)
  })
})

describe("getEpisodes — Override application", () => {
  beforeEach(() => resetMock())

  it("applies title overrides to matching episodes", async () => {
    mockGetEpisodeOverrides.mockResolvedValue(testOverrides)
    setupGetEpisodesMocks(testEpisodes)

    const result = await getEpisodes()

    const ep1 = result.find((e) => e.id === "ep-1")
    const ep3 = result.find((e) => e.id === "ep-3")

    expect(ep1?.title).toBe("عنوان معدّل للحلقة الأولى")
    expect(ep3?.title).toBe("انطلاقة الموسم الثاني")
  })

  it("applies description overrides", async () => {
    mockGetEpisodeOverrides.mockResolvedValue(testOverrides)
    setupGetEpisodesMocks(testEpisodes)

    const result = await getEpisodes()

    const ep3 = result.find((e) => e.id === "ep-3")
    expect(ep3?.description).toBe("وصف جديد")
  })

  it("does not modify episodes without overrides", async () => {
    mockGetEpisodeOverrides.mockResolvedValue(testOverrides)
    setupGetEpisodesMocks(testEpisodes)

    const result = await getEpisodes()

    const ep2 = result.find((e) => e.id === "ep-2")
    expect(ep2?.title).toBe("حلقة مع ضيف مميز")
  })
})

describe("getEpisodes — Pagination", () => {
  beforeEach(() => {
    resetMock()
    mockGetEpisodeOverrides.mockResolvedValue([])
  })

  it("respects limit parameter", async () => {
    setupGetEpisodesMocks(testEpisodes)

    const result = await getEpisodes({ limit: 2 })

    expect(result.length).toBe(2)
  })

  it("respects offset + limit", async () => {
    setupGetEpisodesMocks(testEpisodes)

    const allResult = await getEpisodes()

    resetMock()
    mockGetEpisodeOverrides.mockResolvedValue([])
    setupGetEpisodesMocks(testEpisodes)

    const offsetResult = await getEpisodes({ limit: 2, offset: 2 })

    expect(offsetResult.length).toBe(2)
    expect(offsetResult[0].id).toBe(allResult[2].id)
  })

  it("handles offset beyond array bounds gracefully", async () => {
    setupGetEpisodesMocks(testEpisodes)

    const result = await getEpisodes({ limit: 10, offset: 100 })

    expect(result).toEqual([])
  })
})

describe("getEpisodes — Season filtering", () => {
  beforeEach(() => {
    resetMock()
    mockGetEpisodeOverrides.mockResolvedValue([])
  })

  it("filters by season number", async () => {
    setupGetEpisodesMocks(testEpisodes)

    const result = await getEpisodes({ season: 2 })

    expect(result.length).toBeGreaterThan(0)
    expect(result.every((e) => e.season === 2)).toBe(true)
  })
})

describe("getEpisodes — Guest slug filtering", () => {
  beforeEach(() => {
    resetMock()
    mockGetEpisodeOverrides.mockResolvedValue([])
  })

  it("filters episodes by guest slug", async () => {
    setupGetEpisodesMocks(testEpisodes)

    const result = await getEpisodes({ guestSlug: "ahmed-guest" })

    expect(result.length).toBe(1)
    expect(result[0].guest?.slug).toBe("ahmed-guest")
  })

  it("returns empty for non-existent guest slug", async () => {
    setupGetEpisodesMocks(testEpisodes)

    const result = await getEpisodes({ guestSlug: "nonexistent" })
    expect(result).toEqual([])
  })
})

describe("getLatestEpisode", () => {
  beforeEach(() => {
    resetMock()
    mockGetEpisodeOverrides.mockResolvedValue([])
  })

  it("returns the first episode in the pipeline result", async () => {
    setupGetEpisodesMocks(testEpisodes)

    const result = await getLatestEpisode()

    expect(result).not.toBeNull()
    expect(result!.id).toBeTruthy()
  })
})

describe("getEpisodeCounts", () => {
  beforeEach(() => {
    resetMock()
    mockGetEpisodeOverrides.mockResolvedValue([])
  })

  it("returns correct count after pipeline filtering", async () => {
    setupGetEpisodesMocks(testEpisodes)

    const counts = await getEpisodeCounts()

    expect(counts.all).toBe(testEpisodes.length)
  })

  it("count excludes hidden episodes", async () => {
    setupGetEpisodesMocks(testEpisodes, ["ep-1", "ep-2"])

    const counts = await getEpisodeCounts()

    expect(counts.all).toBe(testEpisodes.length - 2)
  })
})
