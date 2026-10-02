/**
 * Every `/episodes/*` URL in the sitemap must resolve through the SAME lookup
 * `/episodes/[slug]` uses (`resolveEpisodeSlug(slug, getEpisodeBySlug)`).
 *
 * Measured on production 2026-10-02: 36 of 77 sitemap episode URLs answered
 * 404 — exactly the 36 ids in `deleted_episodes` (tombstoned clips/teasers).
 * The page re-reads the tombstones and blocks them; the sitemap's list had
 * been built without them. `getDeletedEpisodeIds` used to answer a DB error
 * with an EMPTY set ("nothing is deleted"), so a list built during one error
 * published every deleted episode for as long as it was cached. It now fails
 * closed (lib/episodes/deleted.ts) — see tests/episodes/deleted-fail-closed.
 *
 * A second, latent divergence is pinned too: the detail lookup used to
 * re-fetch the whole channel LIVE (`fetchEpisodeBySlug`, no fallback) while
 * the list reads the persisted snapshot. If that live call failed, a
 * YouTube-only clip the sitemap listed fell through to the DB and 404'd. The
 * scenario below makes the live call throw.
 */
import { describe, it, expect, vi, beforeAll } from "vitest"
import type { Episode } from "@/types/database"

const { snapshot, tomb } = vi.hoisted(() => {
  // USE_YOUTUBE is read at module load from YOUTUBE_API_KEY.
  process.env.YOUTUBE_API_KEY = "test-key"
  const base = {
    description: "",
    duration_minutes: 3,
    episode_number: 1,
    season: null,
    thumbnail_url: null,
    status: "published",
    featured: false,
    view_count: 10,
    guest: null,
  }
  const snapshot = [
    {
      ...base,
      id: "vidClip001",
      title: "وصلني نبأ تحرير الكويت من جندي العراقي",
      slug: "وصلني-نبأ-تحرير-الكويت-من-جندي-العراقي",
      youtube_url: "https://www.youtube.com/watch?v=vidClip001",
      release_date: "2024-02-01T00:00:00Z",
      created_at: "2024-02-01T00:00:00Z",
      updated_at: "2024-02-01T00:00:00Z",
    },
    {
      ...base,
      id: "vidTeaser02",
      title: "بودكاست خط قريبا ، khatpodcast",
      slug: "بودكاست-خط-قريبا-،-khatpodcast",
      youtube_url: "https://www.youtube.com/watch?v=vidTeaser02",
      release_date: "2023-01-01T00:00:00Z",
      created_at: "2023-01-01T00:00:00Z",
      updated_at: "2023-01-01T00:00:00Z",
    },
    {
      // A clip an operator DELETED (tombstoned) — still in the YouTube snapshot.
      ...base,
      id: "vidTomb03",
      title: "قصة نجاح دوز كافيه",
      slug: "قصة-نجاح-دوز-كافيه",
      youtube_url: "https://www.youtube.com/watch?v=vidTomb03",
      release_date: "2023-06-01T00:00:00Z",
      created_at: "2023-06-01T00:00:00Z",
      updated_at: "2023-06-01T00:00:00Z",
    },
  ]
  const tomb = { ids: new Set(["vidTomb03"]), fail: false }
  return { snapshot, tomb }
})

vi.mock("@/lib/db", () => ({ db: null, pool: {}, USE_DB: false }))
vi.mock("@/lib/cache/episode-cache", () => ({
  getCachedEpisodes: vi.fn().mockResolvedValue(snapshot),
  peekCachedEpisodes: vi.fn().mockResolvedValue({ episodes: snapshot, stale: false, fetchedAt: null }),
}))
// The live channel fetch is DOWN (quota / key / network) — the production case.
vi.mock("@/lib/youtube/queries", () => ({
  fetchEpisodeBySlug: vi.fn().mockRejectedValue(new Error("YouTube API error: quotaExceeded")),
  fetchAllEpisodes: vi.fn().mockRejectedValue(new Error("YouTube API error: quotaExceeded")),
  fetchMostViewedRecent: vi.fn().mockResolvedValue(null),
}))
vi.mock("@/lib/episodes/overrides", () => ({
  getEpisodeOverrides: vi.fn().mockResolvedValue([]),
  applyOverrides: vi.fn().mockImplementation((eps: unknown[]) => eps),
}))
vi.mock("@/lib/episodes/enrichments", () => ({
  getEpisodeEnrichment: vi.fn().mockResolvedValue(null),
  getPublicEpisodeEnrichment: vi.fn().mockResolvedValue(null),
}))
vi.mock("@/lib/episodes/quotes", () => ({ getPublishedQuotes: vi.fn().mockResolvedValue([]) }))
vi.mock("@/lib/episodes/deleted", () => ({
  getDeletedEpisodeIds: vi.fn(async () => {
    if (tomb.fail) throw new Error("deleted_episodes unavailable")
    return tomb.ids
  }),
  listDeletedEpisodeIds: vi.fn().mockResolvedValue([]),
}))
vi.mock("@/lib/queries/categories", () => ({
  getCategories: vi.fn().mockResolvedValue([]),
  getCategoriesForRequest: vi.fn().mockResolvedValue([]),
  getCategoryById: vi.fn().mockResolvedValue(null),
}))
vi.mock("@/lib/queries/topics", () => ({ listTopics: vi.fn().mockResolvedValue([]) }))
// `unstable_cache` needs the Next runtime; the list it wraps is the real one.
vi.mock("@/lib/cache", async () => {
  const q = await import("@/lib/queries/episodes")
  return { getCachedPublicEpisodes: () => q.getEpisodes({ withCategories: true }) }
})

import sitemap from "@/app/sitemap"
import { getEpisodeBySlug } from "@/lib/queries/episodes"
import { resolveEpisodeSlug } from "@/lib/queries/upcoming-episodes"

describe("sitemap /episodes/* URLs resolve through the page's own lookup", () => {
  let episodeSlugs: string[] = []

  beforeAll(async () => {
    const entries = await sitemap()
    episodeSlugs = entries
      .map((e) => new URL(e.url).pathname)
      .filter((p) => p.startsWith("/episodes/"))
      .map((p) => decodeURIComponent(p.slice("/episodes/".length)))
  })

  it("lists the YouTube-only clips (positive control: the list does see them)", () => {
    expect(episodeSlugs).toEqual([snapshot[0].slug, snapshot[1].slug])
  })

  it("a tombstoned clip is neither listed nor served — the two agree", async () => {
    expect(episodeSlugs).not.toContain(snapshot[2].slug)
    expect(await resolveEpisodeSlug(snapshot[2].slug, getEpisodeBySlug)).toBeNull()
  })

  it("tombstones unreadable ⇒ the sitemap lists NO episode (fail closed), never a deleted one", async () => {
    tomb.fail = true
    try {
      const entries = await sitemap()
      expect(entries.filter((e) => e.url.includes("/episodes/"))).toEqual([])
      expect(await getEpisodeBySlug(snapshot[0].slug)).toBeNull()
    } finally {
      tomb.fail = false
    }
  })

  it("every listed slug resolves (no sitemap URL can 404) even when the live YouTube fetch fails", async () => {
    const unresolved: string[] = []
    for (const slug of episodeSlugs) {
      const r = await resolveEpisodeSlug(slug, getEpisodeBySlug)
      if (!r || r.kind !== "episode") unresolved.push(slug)
    }
    expect(unresolved).toEqual([])
  })

  it("a slug that is not in the list still resolves to null (negative control)", async () => {
    expect(await resolveEpisodeSlug("لا-توجد-حلقة-بهذا-الاسم", getEpisodeBySlug)).toBeNull()
  })

  it("resolves the episode with the snapshot's own data", async () => {
    const ep = await getEpisodeBySlug(snapshot[0].slug)
    expect((ep as Episode | null)?.id).toBe("vidClip001")
  })
})
