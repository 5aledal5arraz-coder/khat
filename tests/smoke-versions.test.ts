/**
 * Smoke tests: Episode version history create/read path.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

import { mockDb, mockSelectResult, mockInsertReturning, resetMock } from "./db-mock"
vi.mock("@/lib/db", () => ({ db: mockDb, pool: {}, USE_DB: true }))

import { saveVersion, getVersionHistory, getVersion } from "@/lib/episodes/versions"

describe("Episode Versions — saveVersion", () => {
  beforeEach(() => resetMock())

  it("creates a version with auto-incremented version_number", async () => {
    // First select: max version_number = 3
    mockSelectResult([{ max: 3 }])

    const newVersion = {
      id: "ver-test-123",
      episode_id: "ep-1",
      version_number: 4,
      change_type: "title_override",
      change_summary: "Updated title",
      snapshot: { title: "New Title" },
      created_by: "admin",
      created_at: new Date().toISOString(),
    }
    mockInsertReturning([newVersion])

    const result = await saveVersion("ep-1", "title_override", { title: "New Title" }, "Updated title")

    expect(result).toBeTruthy()
    expect(result.episode_id).toBe("ep-1")
    expect(result.version_number).toBe(4)
    expect(result.change_type).toBe("title_override")
    expect(mockDb.select).toHaveBeenCalled()
    expect(mockDb.insert).toHaveBeenCalled()
  })

  it("starts at version 1 for a new episode (max = 0)", async () => {
    mockSelectResult([{ max: 0 }])

    const newVersion = {
      id: "ver-test-456",
      episode_id: "ep-new",
      version_number: 1,
      change_type: "enrichment",
      change_summary: null,
      snapshot: {},
      created_by: "admin",
      created_at: new Date().toISOString(),
    }
    mockInsertReturning([newVersion])

    const result = await saveVersion("ep-new", "enrichment", {})

    expect(result.version_number).toBe(1)
  })
})

describe("Episode Versions — getVersionHistory", () => {
  beforeEach(() => resetMock())

  it("returns version history sorted by created_at DESC", async () => {
    const versions = [
      { id: "v3", episode_id: "ep-1", version_number: 3, change_type: "quotes", change_summary: null, snapshot: {}, created_by: "admin", created_at: "2026-03-28T12:00:00Z" },
      { id: "v2", episode_id: "ep-1", version_number: 2, change_type: "enrichment", change_summary: null, snapshot: {}, created_by: "admin", created_at: "2026-03-27T12:00:00Z" },
    ]
    mockSelectResult(versions)

    const result = await getVersionHistory("ep-1")

    expect(result).toHaveLength(2)
    expect(result[0].id).toBe("v3")
    expect(result[1].id).toBe("v2")
  })

  it("returns empty array when no versions exist", async () => {
    mockSelectResult([])

    const result = await getVersionHistory("ep-nonexistent")
    expect(result).toEqual([])
  })
})

describe("Episode Versions — getVersion", () => {
  beforeEach(() => resetMock())

  it("returns a specific version by ID", async () => {
    const version = {
      id: "v1",
      episode_id: "ep-1",
      version_number: 1,
      change_type: "visibility",
      change_summary: "Hidden",
      snapshot: { hidden: true },
      created_by: "admin",
      created_at: "2026-03-28T12:00:00Z",
    }
    mockSelectResult([version])

    const result = await getVersion("v1")

    expect(result).not.toBeNull()
    expect(result!.id).toBe("v1")
    expect(result!.change_type).toBe("visibility")
  })

  it("returns null when version not found", async () => {
    mockSelectResult([])

    const result = await getVersion("nonexistent")
    expect(result).toBeNull()
  })
})
