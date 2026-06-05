/**
 * Integration tests: Episode overrides flow.
 * Tests the DB-backed CRUD and the pure applyOverrides logic.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

import { mockDb, mockSelectResult, resetMock } from "./db-mock"
vi.mock("@/lib/db", () => ({ db: mockDb, pool: {}, USE_DB: true }))

import {
  getEpisodeOverrides,
  getEpisodeOverride,
  setEpisodeOverride,
  deleteEpisodeOverride,
  applyOverrides,
} from "@/lib/episodes/overrides"

describe("Episode Overrides — DB Read", () => {
  beforeEach(() => resetMock())

  it("getEpisodeOverrides returns mapped overrides", async () => {
    mockSelectResult([
      { episode_id: "ep-1", original_title: "Original", custom_title: "Custom", custom_description: null },
      { episode_id: "ep-2", original_title: "Orig 2", custom_title: "Cust 2", custom_description: "New desc" },
    ])

    const overrides = await getEpisodeOverrides()

    expect(overrides).toHaveLength(2)
    expect(overrides[0].id).toBe("ep-1")
    expect(overrides[0].customTitle).toBe("Custom")
    expect(overrides[1].customDescription).toBe("New desc")
  })

  it("getEpisodeOverride returns null when not found", async () => {
    mockSelectResult([])

    const result = await getEpisodeOverride("nonexistent")
    expect(result).toBeNull()
  })

  it("getEpisodeOverride returns override for specific episode", async () => {
    mockSelectResult([
      { episode_id: "ep-1", original_title: "Orig", custom_title: "Custom", custom_description: "Desc" },
    ])

    const result = await getEpisodeOverride("ep-1")

    expect(result).not.toBeNull()
    expect(result!.id).toBe("ep-1")
    expect(result!.originalTitle).toBe("Orig")
  })
})

describe("Episode Overrides — DB Write", () => {
  beforeEach(() => resetMock())

  it("setEpisodeOverride calls insert with upsert", async () => {
    await setEpisodeOverride({
      id: "ep-1",
      originalTitle: "Original Title",
      customTitle: "New Title",
      customDescription: "New description",
    })

    expect(mockDb.insert).toHaveBeenCalled()
  })

  it("deleteEpisodeOverride calls delete", async () => {
    await deleteEpisodeOverride("ep-1")
    expect(mockDb.delete).toHaveBeenCalled()
  })
})

describe("Episode Overrides — applyOverrides (pure)", () => {
  it("applies title override to matching episode", () => {
    const episodes = [
      { id: "ep-1", title: "Original Title", description: "Desc" },
      { id: "ep-2", title: "Untouched", description: "Also untouched" },
    ]
    const overrides = [
      { id: "ep-1", originalTitle: "Original Title", customTitle: "Overridden Title" },
    ]

    const result = applyOverrides(episodes, overrides)

    expect(result[0].title).toBe("Overridden Title")
    expect(result[0].description).toBe("Desc") // not overridden
    expect(result[1].title).toBe("Untouched") // no override
  })

  it("applies description override", () => {
    const episodes = [
      { id: "ep-1", title: "Title", description: "Old desc" },
    ]
    const overrides = [
      { id: "ep-1", originalTitle: "Title", customTitle: "Title", customDescription: "New desc" },
    ]

    const result = applyOverrides(episodes, overrides)

    expect(result[0].description).toBe("New desc")
  })

  it("returns episodes unchanged when no overrides match", () => {
    const episodes = [
      { id: "ep-1", title: "Title" },
    ]
    const overrides = [
      { id: "ep-99", originalTitle: "X", customTitle: "Y" },
    ]

    const result = applyOverrides(episodes, overrides)

    expect(result[0].title).toBe("Title")
  })

  it("handles empty overrides array", () => {
    const episodes = [{ id: "ep-1", title: "Title" }]
    const result = applyOverrides(episodes, [])
    expect(result).toEqual(episodes)
  })

  it("handles empty episodes array", () => {
    const result = applyOverrides([], [{ id: "ep-1", originalTitle: "X", customTitle: "Y" }])
    expect(result).toEqual([])
  })
})
