/**
 * Integration tests: Episode enrichments flow.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

import { mockDb, mockSelectResult, resetMock } from "./db-mock"
vi.mock("@/lib/db", () => ({ db: mockDb, pool: {}, USE_DB: true }))

import {
  getEpisodeEnrichment,
  setEpisodeEnrichment,
  deleteEpisodeEnrichment,
} from "@/lib/episodes/enrichments"

describe("Episode Enrichments — Read", () => {
  beforeEach(() => resetMock())

  it("returns null when no enrichment exists", async () => {
    mockSelectResult([])

    const result = await getEpisodeEnrichment("ep-nonexistent")
    expect(result).toBeNull()
  })

  it("returns mapped enrichment when row exists", async () => {
    mockSelectResult([
      {
        episode_id: "ep-1",
        hero_summary: "Hero text",
        full_summary: "Full summary text",
        takeaways: ["Takeaway 1", "Takeaway 2"],
        resources: [{ title: "Resource", url: "https://example.com", type: "link" }],
        timestamps: [{ time_seconds: 60, title: "Intro", description: null }],
        why_this_conversation: null,
        before_you_watch: null,
        conversation_map: null,
        central_question: "What is life?",
        exclusive_clip: null,
        unsaid_reflections: null,
        updated_at: "2026-03-28T12:00:00Z",
      },
    ])

    const result = await getEpisodeEnrichment("ep-1")

    expect(result).not.toBeNull()
    expect(result!.episodeId).toBe("ep-1")
    expect(result!.hero_summary).toBe("Hero text")
    expect(result!.full_summary).toBe("Full summary text")
    expect(result!.takeaways).toHaveLength(2)
    expect(result!.resources).toHaveLength(1)
    expect(result!.timestamps![0].time_seconds).toBe(60)
    expect(result!.central_question).toBe("What is life?")
  })
})

describe("Episode Enrichments — Write", () => {
  beforeEach(() => resetMock())

  it("setEpisodeEnrichment merges with existing data", async () => {
    // Existing enrichment in DB
    mockSelectResult([
      {
        episode_id: "ep-1",
        hero_summary: "Old hero",
        full_summary: "Old full",
        takeaways: ["Old takeaway"],
        resources: [],
        timestamps: [],
        why_this_conversation: null,
        before_you_watch: null,
        conversation_map: null,
        central_question: null,
        exclusive_clip: null,
        unsaid_reflections: null,
        updated_at: "2026-03-27T12:00:00Z",
      },
    ])

    await setEpisodeEnrichment({
      episodeId: "ep-1",
      hero_summary: "New hero",
      updatedAt: new Date().toISOString(),
    })

    expect(mockDb.insert).toHaveBeenCalled()
  })

  it("setEpisodeEnrichment works when no existing row", async () => {
    mockSelectResult([]) // no existing

    await setEpisodeEnrichment({
      episodeId: "ep-new",
      hero_summary: "Fresh hero",
      full_summary: "Fresh summary",
      updatedAt: new Date().toISOString(),
    })

    expect(mockDb.insert).toHaveBeenCalled()
  })

  it("deleteEpisodeEnrichment calls delete", async () => {
    await deleteEpisodeEnrichment("ep-1")
    expect(mockDb.delete).toHaveBeenCalled()
  })
})
