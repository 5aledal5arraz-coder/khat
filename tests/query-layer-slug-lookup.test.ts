/**
 * Query layer tests: Slug-based lookups (episode detail + guest detail).
 *
 * Tests getEpisodeBySlug() and getGuestBySlug() — the paths that
 * power /episodes/[slug] and /guests/[slug] pages.
 *
 * DB-only path (no YouTube).
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

import { mockDb, mockSelectResult, resetMock } from "./db-mock"
import { makeEpisode, makeGuest } from "./fixtures"

// Hoisted mocks for controllable overrides
const { mockGetEpisodeOverrides, mockApplyOverrides } = vi.hoisted(() => {
  // The test file's mocks for `@/lib/cache/episode-cache` (mockRejectedValue)
  // and `@/lib/youtube/queries` (null returns) assume USE_YOUTUBE=false in
  // `lib/queries/episodes.ts`. `.env.local` defines YOUTUBE_API_KEY for
  // normal dev runs, which would otherwise change the resolveEpisodeBySlug
  // code path. Unset it here — inside vi.hoisted so it runs above all
  // imports — to restore the env shape the tests were written against.
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

// ── Mocks ───────────────────────────────────────────────────────────────────

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
// were written. `getDeletedEpisodeIds` now runs inside getEpisodeBySlug
// alongside getHiddenEpisodeIds; without this mock it consumes a FIFO
// slot from the shared db-mock queue, shifting downstream consumers
// off-by-one (which is what was making the slug lookup return guest
// rows). Empty Set / array is the test default since no scenario in
// this file exercises tombstoning.
vi.mock("@/lib/episodes/deleted", () => ({
  getDeletedEpisodeIds: vi.fn().mockResolvedValue(new Set<string>()),
  listDeletedEpisodeIds: vi.fn().mockResolvedValue([]),
}))

import {
  getEpisodeBySlug,
  getGuestBySlug,
} from "@/lib/queries/episodes"

// ── Helpers ─────────────────────────────────────────────────────────────────

const testEpisode = makeEpisode({
  id: "ep-1",
  slug: "test-episode",
  title: "حلقة اختبار",
  description: "وصف الحلقة",
  guest_id: "guest-1",
})

const testGuest = makeGuest({ id: "guest-1", name: "أحمد الضيف", slug: "ahmed-guest" })

/**
 * getEpisodeBySlug call sequence (DB-only path):
 *   1. getHiddenEpisodeIds() → select from hidden_episodes
 *   2. fetchDbEpisodeDetail(slug) → select from episodes (where slug = ...)
 *   3. (if guest_id) → select from guests
 *   4. select from timestamps
 *   5. select from quotes
 *   6. select from resources
 *   7. getPublishedQuotes() → mocked (returns [])
 *   8. getEpisodeOverrides() → mocked
 *   9. applyOverrides() → mocked
 *
 * All selects go through the same FIFO queue.
 */
function setupEpisodeBySlugMocks(ep: ReturnType<typeof makeEpisode>, hiddenIds: string[] = []) {
  // #1: hidden episode IDs
  mockSelectResult(hiddenIds.map((id) => ({ episode_id: id })))

  // #2: episode row (fetchDbEpisodeDetail queries episodes table)
  mockSelectResult([{
    ...ep,
    release_date: ep.release_date,
    created_at: new Date(ep.created_at),
    updated_at: ep.updated_at ? new Date(ep.updated_at) : new Date(),
  }])

  // #3: guest row (if guest_id is set)
  if (ep.guest_id) {
    const guest = ep.guest || testGuest
    mockSelectResult([{
      ...guest,
      created_at: new Date(guest.created_at),
    }])
  }

  // #4: timestamps
  mockSelectResult([])

  // #5: quotes (DB quotes table, not config quotes)
  mockSelectResult([])

  // #6: resources
  mockSelectResult([])
}

/**
 * getGuestBySlug call sequence (DB-only path):
 *   1. select from guests (where slug = ...)
 *   2. select from episodes (where guest_id = ...)
 *   3. select from quotes (where guest_id = ...)
 */
function setupGuestBySlugMocks(guest: ReturnType<typeof makeGuest>, episodes: ReturnType<typeof makeEpisode>[] = []) {
  // #1: guest row
  mockSelectResult([{
    ...guest,
    created_at: new Date(guest.created_at),
  }])

  // #2: guest's episodes
  const epRows = episodes.map((ep) => ({
    ...ep,
    release_date: ep.release_date,
    created_at: new Date(ep.created_at),
    updated_at: ep.updated_at ? new Date(ep.updated_at) : new Date(),
  }))
  mockSelectResult(epRows)

  // #3: guest's quotes
  mockSelectResult([])
}

// ── getEpisodeBySlug Tests ──────────────────────────────────────────────────

describe("getEpisodeBySlug — DB source", () => {
  beforeEach(() => {
    resetMock()
    mockGetEpisodeOverrides.mockResolvedValue([])
  })

  it("returns full episode detail for existing slug", async () => {
    setupEpisodeBySlugMocks(testEpisode)

    const result = await getEpisodeBySlug("test-episode")

    expect(result).not.toBeNull()
    expect(result!.id).toBe("ep-1")
    expect(result!.slug).toBe("test-episode")
    expect(result!.title).toBe("حلقة اختبار")
    expect(result!.timestamps).toEqual([])
    expect(result!.quotes).toEqual([])
    expect(result!.resources).toEqual([])
  })

  it("includes guest data in episode detail", async () => {
    const epWithGuest = {
      ...testEpisode,
      guest: testGuest,
    }
    setupEpisodeBySlugMocks(epWithGuest)

    const result = await getEpisodeBySlug("test-episode")

    expect(result!.guest).not.toBeNull()
    expect(result!.guest!.name).toBe("أحمد الضيف")
    expect(result!.guest!.slug).toBe("ahmed-guest")
  })

  it("returns null for non-existent slug", async () => {
    // #1: hidden IDs
    mockSelectResult([])
    // #2: episode query returns empty
    mockSelectResult([])

    const result = await getEpisodeBySlug("nonexistent-slug")
    expect(result).toBeNull()
  })

  it("blocks hidden episodes from being returned", async () => {
    setupEpisodeBySlugMocks(testEpisode, ["ep-1"]) // ep-1 is hidden

    const result = await getEpisodeBySlug("test-episode")

    expect(result).toBeNull()
  })

  it("applies overrides to episode detail", async () => {
    mockGetEpisodeOverrides.mockResolvedValue([
      { id: "ep-1", originalTitle: "حلقة اختبار", customTitle: "عنوان جديد" },
    ])
    setupEpisodeBySlugMocks(testEpisode)

    const result = await getEpisodeBySlug("test-episode")

    expect(result!.title).toBe("عنوان جديد")
  })

  it("includes timestamps when available", async () => {
    // #1: hidden
    mockSelectResult([])
    // #2: episode
    mockSelectResult([{
      ...testEpisode,
      created_at: new Date(testEpisode.created_at),
      updated_at: new Date(),
    }])
    // #3: guest
    mockSelectResult([{ ...testGuest, created_at: new Date(testGuest.created_at) }])
    // #4: timestamps with data
    mockSelectResult([
      { id: "ts-1", episode_id: "ep-1", time_seconds: 0, title: "مقدمة", description: null },
      { id: "ts-2", episode_id: "ep-1", time_seconds: 300, title: "المحور الأول", description: "بداية الحوار" },
    ])
    // #5: quotes
    mockSelectResult([])
    // #6: resources
    mockSelectResult([])

    const result = await getEpisodeBySlug("test-episode")

    expect(result!.timestamps).toHaveLength(2)
    expect(result!.timestamps[0].title).toBe("مقدمة")
    expect(result!.timestamps[1].time_seconds).toBe(300)
  })
})

// ── getGuestBySlug Tests ────────────────────────────────────────────────────

describe("getGuestBySlug — DB source", () => {
  beforeEach(() => {
    resetMock()
    mockGetEpisodeOverrides.mockResolvedValue([])
  })

  it("returns guest with episodes", async () => {
    const guestEpisodes = [
      makeEpisode({ id: "ep-1", title: "حلقة ١", guest_id: "guest-1" }),
      makeEpisode({ id: "ep-2", title: "حلقة ٢", guest_id: "guest-1" }),
    ]
    setupGuestBySlugMocks(testGuest, guestEpisodes)

    const result = await getGuestBySlug("ahmed-guest")

    expect(result).not.toBeNull()
    expect(result!.name).toBe("أحمد الضيف")
    expect(result!.slug).toBe("ahmed-guest")
    expect(result!.episodes).toHaveLength(2)
    expect(result!.quotes).toEqual([])
  })

  it("returns null for non-existent guest slug", async () => {
    mockSelectResult([]) // guest query returns empty

    const result = await getGuestBySlug("nonexistent")
    expect(result).toBeNull()
  })

  it("returns guest with empty episodes when no episodes exist", async () => {
    setupGuestBySlugMocks(testGuest, [])

    const result = await getGuestBySlug("ahmed-guest")

    expect(result).not.toBeNull()
    expect(result!.episodes).toEqual([])
  })

  it("includes guest quotes", async () => {
    // #1: guest
    mockSelectResult([{ ...testGuest, created_at: new Date(testGuest.created_at) }])
    // #2: episodes
    mockSelectResult([])
    // #3: quotes
    mockSelectResult([
      { id: "q-1", episode_id: "ep-1", guest_id: "guest-1", text: "اقتباس", theme: "حياة", created_at: new Date() },
    ])

    const result = await getGuestBySlug("ahmed-guest")

    expect(result!.quotes).toHaveLength(1)
    expect(result!.quotes[0].text).toBe("اقتباس")
  })
})
