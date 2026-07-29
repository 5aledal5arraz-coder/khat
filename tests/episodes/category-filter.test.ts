/**
 * Category slug resolution.
 *
 * The behaviour under test is the one that was actually broken: filtering by
 * an unknown slug returned `[]`, so a typo rendered an empty archive that
 * looked like a truthful "this category has no episodes" answer. Unknown and
 * empty must resolve to DIFFERENT states.
 */

import { describe, expect, it } from "vitest"
import { resolveCategorySlug } from "@/lib/episodes/category-filter"
import type { EpisodeCategory } from "@/types/database"

const cat = (name: string, slug: string, id: string): EpisodeCategory => ({
  id,
  name,
  slug,
  sort_order: 0,
  created_at: "2026-01-01T00:00:00.000Z",
})

// The real production rows — Arabic slugs, which is the whole difficulty.
const CATEGORIES: EpisodeCategory[] = [
  cat("سالفة", "سالفة", "c1"),
  cat("مقاطع خط", "مقاطع-خط", "c2"),
  cat("الموسم الاول", "الموسم-الاول", "c3"),
]

describe("resolveCategorySlug", () => {
  it("returns `none` when no category is requested", () => {
    expect(resolveCategorySlug(CATEGORIES, undefined).state).toBe("none")
    expect(resolveCategorySlug(CATEGORIES, null).state).toBe("none")
    expect(resolveCategorySlug(CATEGORIES, "").state).toBe("none")
    expect(resolveCategorySlug(CATEGORIES, "   ").state).toBe("none")
  })

  it("resolves a plain Arabic slug", () => {
    const r = resolveCategorySlug(CATEGORIES, "سالفة")
    expect(r.state).toBe("known")
    if (r.state === "known") expect(r.category.id).toBe("c1")
  })

  it("resolves a percent-encoded Arabic slug — the form every real request uses", () => {
    const r = resolveCategorySlug(CATEGORIES, encodeURIComponent("مقاطع-خط"))
    expect(r.state).toBe("known")
    if (r.state === "known") expect(r.category.name).toBe("مقاطع خط")
  })

  it('treats "مقاطع خط" with no name-special-casing — it is just another category', () => {
    const khat = resolveCategorySlug(CATEGORIES, "مقاطع-خط")
    const season = resolveCategorySlug(CATEGORIES, "الموسم-الاول")
    expect(khat.state).toBe("known")
    expect(season.state).toBe("known")
  })

  it("reports an unknown slug as UNKNOWN, never as an empty category", () => {
    const r = resolveCategorySlug(CATEGORIES, "لا-يوجد")
    expect(r.state).toBe("unknown")
    if (r.state === "unknown") expect(r.slug).toBe("لا-يوجد")
  })

  it("reports unknown when the category list is empty (no DB) rather than crashing", () => {
    expect(resolveCategorySlug([], "سالفة").state).toBe("unknown")
  })

  it("does not throw on a malformed percent escape", () => {
    const r = resolveCategorySlug(CATEGORIES, "%E0%A4%A")
    expect(r.state).toBe("unknown")
  })

  it("trims surrounding whitespace before matching", () => {
    expect(resolveCategorySlug(CATEGORIES, "  سالفة  ").state).toBe("known")
  })
})
