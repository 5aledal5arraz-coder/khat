/**
 * Integration tests: Episode quotes flow.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

import { mockDb, mockSelectResult, resetMock } from "./db-mock"
vi.mock("@/lib/db", () => ({ db: mockDb, pool: {}, USE_DB: true }))

import {
  getEpisodeQuotesEntry,
  setEpisodeQuotesEntry,
  deleteEpisodeQuotesEntry,
  getPublishedQuotes,
} from "@/lib/episodes/quotes"

const sampleQuotes = [
  { id: "q-1", text: "اقتباس أول", theme: "حياة", speaker: "guest", hidden: false },
  { id: "q-2", text: "اقتباس ثاني", theme: "أمل", speaker: "host", hidden: false },
  { id: "q-3", text: "مخفي", theme: null, speaker: null, hidden: true },
]

describe("Episode Quotes — Read", () => {
  beforeEach(() => resetMock())

  it("returns null when no quotes entry exists", async () => {
    mockSelectResult([])

    const result = await getEpisodeQuotesEntry("ep-nonexistent")
    expect(result).toBeNull()
  })

  it("returns mapped quotes entry when row exists", async () => {
    mockSelectResult([
      {
        episode_id: "ep-1",
        episode_title: "حلقة الاختبار",
        quotes: sampleQuotes,
        transcript: null,
        status: "published",
        generated_at: "2026-03-28T12:00:00Z",
        published_at: "2026-03-28T12:00:00Z",
      },
    ])

    const result = await getEpisodeQuotesEntry("ep-1")

    expect(result).not.toBeNull()
    expect(result!.episodeId).toBe("ep-1")
    expect(result!.episodeTitle).toBe("حلقة الاختبار")
    expect(result!.quotes).toHaveLength(3)
    expect(result!.status).toBe("published")
  })
})

describe("Episode Quotes — getPublishedQuotes", () => {
  beforeEach(() => resetMock())

  it("returns only non-hidden quotes in Quote format", async () => {
    mockSelectResult([
      {
        episode_id: "ep-1",
        episode_title: "Test",
        quotes: sampleQuotes,
        transcript: null,
        status: "published",
        generated_at: "2026-03-28T12:00:00Z",
        published_at: "2026-03-28T12:00:00Z",
      },
    ])

    const result = await getPublishedQuotes("ep-1", "guest-1")

    // Should exclude hidden quote (q-3)
    expect(result).toHaveLength(2)
    expect(result[0].id).toBe("q-1")
    expect(result[0].episode_id).toBe("ep-1")
    expect(result[0].guest_id).toBe("guest-1")
    expect(result[0].text).toBe("اقتباس أول")
    expect(result[1].id).toBe("q-2")
  })

  it("returns empty array when no published quotes", async () => {
    mockSelectResult([])

    const result = await getPublishedQuotes("ep-1", null)
    expect(result).toEqual([])
  })
})

describe("Episode Quotes — Write", () => {
  beforeEach(() => resetMock())

  it("setEpisodeQuotesEntry calls insert with upsert", async () => {
    await setEpisodeQuotesEntry({
      episodeId: "ep-1",
      episodeTitle: "Test Episode",
      quotes: sampleQuotes,
      transcript: null,
      status: "draft",
      generatedAt: new Date().toISOString(),
      publishedAt: null,
    })

    expect(mockDb.insert).toHaveBeenCalled()
  })

  it("deleteEpisodeQuotesEntry calls delete", async () => {
    await deleteEpisodeQuotesEntry("ep-1")
    expect(mockDb.delete).toHaveBeenCalled()
  })
})
