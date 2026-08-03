/**
 * `episodeGenerationContext()` — the db adapter that answers the two questions
 * every AI generator has to ask before it spends anything: which programme is
 * this, and what do I charge the cost to.
 *
 * The adapter must add NO opinion of its own. The things worth pinning are the
 * places one could leak in: what an episode with no category resolves to (خط,
 * deliberately), what a missing row resolves to (null — "I could not tell",
 * NOT خط), and that the eir_id survives every one of those branches, because
 * an `ai_runs` row written without it can never be attributed afterwards.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

const { getCategoryById } = vi.hoisted(() => ({ getCategoryById: vi.fn() }))

import { mockDb, mockSelectResult, resetMock } from "../db-mock"
vi.mock("@/lib/db", () => ({ db: mockDb, pool: {}, USE_DB: true }))
vi.mock("@/lib/queries/categories", () => ({ getCategoryById }))

import { episodeGenerationContext } from "@/lib/episodes/generation-context"

beforeEach(() => {
  resetMock()
  vi.clearAllMocks()
})

describe("episodeGenerationContext — lane", () => {
  it("returns null — not خط — when the episode row does not exist", async () => {
    mockSelectResult([])
    expect(await episodeGenerationContext("ep-ghost")).toEqual({ lane: null, eirId: null })
    // No point asking about a category for a row that isn't there.
    expect(getCategoryById).not.toHaveBeenCalled()
  })

  it("returns خط for an episode with no category yet, without a category lookup", async () => {
    mockSelectResult([{ category_id: null, eir_id: null }])
    expect((await episodeGenerationContext("ep-fresh")).lane).toBe("khat")
    expect(getCategoryById).not.toHaveBeenCalled()
  })

  it("returns خط for a season category", async () => {
    mockSelectResult([{ category_id: "cat-1", eir_id: null }])
    getCategoryById.mockResolvedValue({ id: "cat-1", name: "الموسم الاول", slug: "الموسم-الاول" })
    expect((await episodeGenerationContext("ep-1")).lane).toBe("khat")
  })

  it("returns خط when the category id resolves to nothing (a deleted category)", async () => {
    mockSelectResult([{ category_id: "cat-gone", eir_id: null }])
    getCategoryById.mockResolvedValue(null)
    expect((await episodeGenerationContext("ep-1")).lane).toBe("khat")
  })

  it("classifies clips and the separate programme through the shared decision point", async () => {
    // Read the slugs from the classifier itself rather than restating them —
    // a test that hardcodes them would keep passing after a rename while the
    // real episodes silently moved into خط.
    const { LANE_EXCEPTION_SLUGS } = await import("@/lib/episodes/programs")
    const { CLIPS_CATEGORY_SLUG } = await import("@/lib/episodes/clips")
    const separateSlug = LANE_EXCEPTION_SLUGS.find((s) => s !== CLIPS_CATEGORY_SLUG)!

    mockSelectResult([{ category_id: "cat-clips", eir_id: null }])
    getCategoryById.mockResolvedValue({ id: "cat-clips", name: "مقاطع خط", slug: CLIPS_CATEGORY_SLUG })
    expect((await episodeGenerationContext("ep-clip")).lane).toBe("clips")

    mockSelectResult([{ category_id: "cat-sep", eir_id: null }])
    getCategoryById.mockResolvedValue({ id: "cat-sep", name: "سالفة", slug: separateSlug })
    expect((await episodeGenerationContext("ep-sep")).lane).toBe("separate")
  })
})

describe("episodeGenerationContext — cost attribution", () => {
  it("carries the eir_id through the uncategorised (early-return) branch", async () => {
    // That branch returns BEFORE the category lookup, which is exactly the
    // shape where an eir_id gets dropped without anyone noticing.
    mockSelectResult([{ category_id: null, eir_id: "eir-7" }])
    expect(await episodeGenerationContext("ep-fresh")).toEqual({ lane: "khat", eirId: "eir-7" })
  })

  it("carries the eir_id through the categorised branch", async () => {
    mockSelectResult([{ category_id: "cat-1", eir_id: "eir-7" }])
    getCategoryById.mockResolvedValue({ id: "cat-1", name: "الموسم الاول", slug: "الموسم-الاول" })
    expect(await episodeGenerationContext("ep-1")).toEqual({ lane: "khat", eirId: "eir-7" })
  })

  it("reports a null eir_id as null rather than undefined", async () => {
    mockSelectResult([{ category_id: null, eir_id: null }])
    expect((await episodeGenerationContext("ep-1")).eirId).toBeNull()
  })
})
