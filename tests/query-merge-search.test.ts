/**
 * Tests for the pure functions in the query pipeline:
 * - mergeEpisode / mergeEpisodeLists (YouTube + DB merge logic)
 * - searchEpisodes / normalizeArabic (Arabic-aware search)
 *
 * These are critical for data correctness on the public site.
 * No mocks needed — these are pure functions.
 */
import { describe, it, expect } from "vitest"

import { mergeEpisode, mergeEpisodeLists } from "@/lib/episodes/merge"
import { searchEpisodes, normalizeArabic, searchGuests } from "@/lib/search"
import { makeEpisode, makeGuest, testEpisodes } from "./fixtures"
import type { Episode } from "@/types/database"

// ── mergeEpisode ────────────────────────────────────────────────────────────

describe("mergeEpisode", () => {
  it("returns YouTube episode unchanged when DB is null", () => {
    const yt = makeEpisode({ id: "ep-1", title: "YouTube Title" })
    const result = mergeEpisode(yt, null)
    expect(result.title).toBe("YouTube Title")
  })

  it("DB fields win over YouTube for non-stats fields", () => {
    const yt = makeEpisode({ id: "ep-1", title: "YT Title", description: "YT Desc" })
    const db: Partial<Episode> = { id: "ep-1", title: "DB Title", description: "DB Desc" }

    const result = mergeEpisode(yt, db)

    expect(result.title).toBe("DB Title")
    expect(result.description).toBe("DB Desc")
  })

  it("YouTube always wins for view_count, duration_minutes, thumbnail_url", () => {
    const yt = makeEpisode({
      id: "ep-1",
      view_count: 5000,
      duration_minutes: 60,
      thumbnail_url: "https://yt.com/thumb.jpg",
    })
    const db: Partial<Episode> = {
      id: "ep-1",
      view_count: 100,
      duration_minutes: 30,
      thumbnail_url: "https://old.com/thumb.jpg",
    }

    const result = mergeEpisode(yt, db)

    expect(result.view_count).toBe(5000) // YouTube wins
    expect(result.duration_minutes).toBe(60) // YouTube wins
    expect(result.thumbnail_url).toBe("https://yt.com/thumb.jpg") // YouTube wins
  })

  it("skips null/undefined/empty DB values", () => {
    const yt = makeEpisode({ id: "ep-1", title: "YT Title", description: "YT Desc" })
    const db: Partial<Episode> = { id: "ep-1", title: "", description: null }

    const result = mergeEpisode(yt, db)

    expect(result.title).toBe("YT Title") // empty string skipped
    expect(result.description).toBe("YT Desc") // null skipped
  })

  it("skips empty arrays from DB", () => {
    const yt = makeEpisode({ id: "ep-1", key_takeaways: ["YT Takeaway"] })
    const db: Partial<Episode> = { id: "ep-1", key_takeaways: [] }

    const result = mergeEpisode(yt, db)

    expect(result.key_takeaways).toEqual(["YT Takeaway"]) // empty array skipped
  })

  it("id always comes from YouTube", () => {
    const yt = makeEpisode({ id: "yt-id" })
    const db: Partial<Episode> = { id: "db-id", title: "DB Title" }

    const result = mergeEpisode(yt, db)

    expect(result.id).toBe("yt-id")
  })
})

describe("mergeEpisodeLists", () => {
  it("merges YouTube and DB episodes by ID", () => {
    const ytList = [
      makeEpisode({ id: "ep-1", title: "YT 1" }),
      makeEpisode({ id: "ep-2", title: "YT 2" }),
    ]
    const dbList = [
      { id: "ep-1", title: "DB 1", guest_id: "g1" } as Partial<Episode>,
    ]

    const result = mergeEpisodeLists(ytList, dbList)

    expect(result.length).toBe(2) // ep-1 merged, ep-2 unchanged
    expect(result[0].title).toBe("DB 1") // DB wins
    expect(result[0].guest_id).toBe("g1")
    expect(result[1].title).toBe("YT 2")
  })

  it("includes DB-only episodes not on YouTube", () => {
    const ytList = [makeEpisode({ id: "ep-1" })]
    const dbList = [
      { id: "ep-99", title: "DB Only", slug: "db-only", youtube_url: "https://yt.com/v/db" } as Partial<Episode>,
    ]

    const result = mergeEpisodeLists(ytList, dbList)

    expect(result.length).toBe(2)
    expect(result[1].id).toBe("ep-99")
  })

  it("excludes DB-only episodes without required fields", () => {
    const ytList = [makeEpisode({ id: "ep-1" })]
    const dbList = [
      { id: "ep-99" } as Partial<Episode>, // missing title + youtube_url
    ]

    const result = mergeEpisodeLists(ytList, dbList)

    expect(result.length).toBe(1) // DB-only excluded
  })

  it("handles empty YouTube list", () => {
    const dbList = [
      { id: "ep-1", title: "DB", slug: "db", youtube_url: "https://yt.com/v" } as Partial<Episode>,
    ]

    const result = mergeEpisodeLists([], dbList)

    expect(result.length).toBe(1)
  })

  it("handles both empty", () => {
    const result = mergeEpisodeLists([], [])
    expect(result).toEqual([])
  })
})

// ── normalizeArabic ─────────────────────────────────────────────────────────

describe("normalizeArabic", () => {
  it("removes tashkeel/diacritics", () => {
    expect(normalizeArabic("بُودْكَاسْت")).toBe("بودكاست")
  })

  it("normalizes alef forms to bare alef", () => {
    expect(normalizeArabic("أحمد إبراهيم آل")).toBe("احمد ابراهيم ال")
  })

  it("normalizes taa marbuta to haa", () => {
    expect(normalizeArabic("حلقة")).toBe("حلقه")
  })

  it("normalizes alef maqsura to yaa", () => {
    expect(normalizeArabic("موسى")).toBe("موسي")
  })

  it("removes tatweel", () => {
    expect(normalizeArabic("خـــط")).toBe("خط")
  })

  it("lowercases Latin characters", () => {
    expect(normalizeArabic("Podcast خط")).toBe("podcast خط")
  })
})

// ── searchEpisodes ──────────────────────────────────────────────────────────

describe("searchEpisodes", () => {
  it("finds episode by Arabic title", () => {
    const result = searchEpisodes(testEpisodes, "ضيف مميز")

    expect(result.length).toBeGreaterThan(0)
    expect(result[0].id).toBe("ep-2") // "حلقة مع ضيف مميز"
  })

  it("finds episode by guest name", () => {
    const result = searchEpisodes(testEpisodes, "أحمد")

    expect(result.length).toBeGreaterThan(0)
    expect(result[0].guest?.name).toContain("أحمد")
  })

  it("returns all episodes for empty query", () => {
    const result = searchEpisodes(testEpisodes, "")
    expect(result.length).toBe(testEpisodes.length)
  })

  it("returns empty for no-match query", () => {
    const result = searchEpisodes(testEpisodes, "كلمة غير موجودة أبداً")
    expect(result).toEqual([])
  })

  it("ranks title matches higher than description matches", () => {
    const episodes = [
      makeEpisode({ id: "desc-match", title: "عنوان آخر", description: "الموسم الأول" }),
      makeEpisode({ id: "title-match", title: "الموسم الأول — حلقة", description: "وصف عادي" }),
    ]

    const result = searchEpisodes(episodes, "الموسم الأول")

    expect(result[0].id).toBe("title-match") // title match ranked higher
  })

  it("normalizes Arabic before searching (alef forms, tashkeel)", () => {
    const episodes = [
      makeEpisode({ id: "ep-1", title: "إبراهيم" }),
    ]

    // Search with different alef form
    const result = searchEpisodes(episodes, "ابراهيم")
    expect(result.length).toBe(1)
  })
})

// ── searchGuests ────────────────────────────────────────────────────────────

describe("searchGuests", () => {
  const guests = [
    makeGuest({ id: "g1", name: "أحمد الضيف", bio: "مهندس برمجيات" }),
    makeGuest({ id: "g2", name: "فاطمة العلي", bio: "كاتبة ومدونة" }),
    makeGuest({ id: "g3", name: "محمد الأحمد", bio: "طبيب أسنان" }),
  ]

  it("finds guest by name", () => {
    const result = searchGuests(guests, "فاطمة")
    expect(result.length).toBe(1)
    expect(result[0].id).toBe("g2")
  })

  it("finds guest by bio keyword", () => {
    const result = searchGuests(guests, "طبيب")
    expect(result.length).toBe(1)
    expect(result[0].id).toBe("g3")
  })

  it("returns all for empty query", () => {
    const result = searchGuests(guests, "")
    expect(result.length).toBe(3)
  })

  it("ranks name matches above bio matches", () => {
    const result = searchGuests(guests, "أحمد")
    // "أحمد الضيف" (name match) should rank above "محمد الأحمد" (partial name match)
    expect(result[0].id).toBe("g1")
  })
})
