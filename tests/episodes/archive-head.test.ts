/**
 * The archive's <head> must agree with its own body — on BOTH URL families.
 *
 * `/categories/[slug]` was corrected to stop calling «سالفة» a category of خط's
 * episodes. `/episodes?lane=separate` renders the identical sixteen cards and
 * kept the archive-wide copy, so the same contradiction survived one URL over:
 *
 *   /categories/سالفة        «سالفة» برنامج مستقل — مو من حلقات بودكاست خط  ✅
 *   /episodes?lane=separate  استعرض جميع حلقات بودكاست خط…                  🔴
 *
 * A canonical does not fix that. It consolidates ranking; it does not replace
 * the description a crawler quotes or the card a share preview draws on THAT
 * url. So the copy is asserted here per URL, not per canonical.
 *
 * The second half is the canonical itself: every search inside a non-default
 * lane declared itself a duplicate of one category page. A search result over a
 * subset is not that page's content, and the fix is to say it is not a page.
 */
import { describe, it, expect, vi } from "vitest"

import type { EpisodeCategory } from "@/types/database"

const cat = (name: string, slug: string, id: string): EpisodeCategory => ({
  id,
  name,
  slug,
  sort_order: 0,
  created_at: "2026-01-01T00:00:00.000Z",
})

const SEASON = cat("الموسم الاول", "الموسم-الاول", "c1")
const SALFA = cat("سالفة", "سالفة", "c2")
const CLIPS = cat("مقاطع خط", "مقاطع-خط", "c3")
const ALL = [SEASON, SALFA, CLIPS]

vi.mock("@/lib/queries/categories", () => ({
  getCategoriesForRequest: vi.fn().mockResolvedValue(ALL),
}))

const { generateMetadata } = await import("@/app/episodes/page")
const { generateMetadata: categoryMetadataRoute } = await import("@/app/categories/[slug]/page")
const { categoryMetadata, laneNote } = await import("@/lib/episodes/programs")

/** `/episodes?…` as Next hands it to generateMetadata. */
const head = (params: Record<string, string>) =>
  generateMetadata({ searchParams: Promise.resolve(params) })

describe("the archive head follows the classification, not a string beside it", () => {
  it("does not call the سالفة lane a set of بودكاست خط episodes", () => {
    return head({ lane: "separate" }).then((meta) => {
      expect(meta.description).not.toBe("استعرض جميع حلقات بودكاست خط — حوارات عميقة وأفكار تبقى.")
      expect(meta.description).toBe(laneNote("separate", ALL))
      expect(meta.description).toContain("مو من حلقات بودكاست خط")
    })
  })

  it("does not call the clips lane «الحلقات»", async () => {
    // Six rows the page's own note says are NOT complete episodes, under a
    // title announcing the episodes. Same fault as the description.
    const meta = await head({ lane: "clips" })
    expect(meta.description).toBe(laneNote("clips", ALL))
    expect(meta.description).toContain("مو حلقات كاملة")
    expect(meta.title).not.toBe("الحلقات")
  })

  it("says the same thing as /categories/<slug> for the same list, by construction", async () => {
    // The two URL families render the identical cards. They now come from one
    // function call, so they cannot drift apart again — which is the actual
    // fix; matching strings today would only be a coincidence worth breaking.
    for (const category of ALL) {
      const viaEpisodes = await head({ category: category.slug })
      const expected = categoryMetadata(category, ALL)
      expect(viaEpisodes.title, `${category.slug} title`).toBe(expected.title)
      expect(viaEpisodes.description, `${category.slug} description`).toBe(expected.description)

      const viaCategories = await categoryMetadataRoute({
        params: Promise.resolve({ slug: category.slug }),
      })
      expect(viaCategories.title, `${category.slug} title drifted between routes`).toBe(
        viaEpisodes.title,
      )
      expect(
        viaCategories.description,
        `${category.slug} description drifted between routes`,
      ).toBe(viaEpisodes.description)
    }
  })

  it("gives a one-category lane the same head as the page it canonicalises to", async () => {
    // Three URLs, sixteen identical cards. `?lane=separate` used to title
    // itself «سالفة» while the page its own canonical named said «سالفة —
    // برنامج منفصل» — the tag that exists precisely because «سالفة» alone
    // tells a searcher nothing about what it is.
    const viaLane = await head({ lane: "separate" })
    const viaCategory = await head({ category: "سالفة" })
    const expected = categoryMetadata(SALFA, ALL)

    expect(viaLane.title).toBe(expected.title)
    expect(viaLane.title).toContain("برنامج منفصل")
    expect(viaLane.title).toBe(viaCategory.title)
    expect(viaLane.description).toBe(viaCategory.description)
  })

  it("keeps the archive-wide copy on the front door", async () => {
    // /episodes with nothing on it is the whole archive's entry point, and
    // «استعرض جميع حلقات بودكاست خط» is a true sentence about the default lane.
    const meta = await head({})
    expect(meta.title).toBe("الحلقات")
    expect(meta.description).toContain("استعرض جميع حلقات بودكاست خط")
  })

  it("falls back to the archive copy for an unknown category, and does not name it", async () => {
    const meta = await head({ category: "لا-يوجد" })
    expect(meta.title).toBe("الحلقات")
    expect(meta.description).toContain("استعرض جميع حلقات بودكاست خط")
  })
})

describe("a search is not a page", () => {
  const canonical = (meta: Awaited<ReturnType<typeof head>>) => meta.alternates?.canonical

  it("declares no canonical for a search, in any lane", async () => {
    // What shipped: BOTH of these named /categories/سالفة as the page this
    // content really lives on — the strongest instruction a crawler is given,
    // and false. The list a search returns is a subset of that page, not it.
    const cases: Record<string, string>[] = [
      { search: "غزو", lane: "separate" },
      { search: "غزو", category: "سالفة" },
      { search: "غزو", lane: "clips" },
      { search: "غزو" },
    ]
    for (const params of cases) {
      const meta = await head(params)
      expect(canonical(meta), `${JSON.stringify(params)} still claims a canonical`).toBeUndefined()
      expect(meta.robots, `${JSON.stringify(params)} is indexable`).toEqual({
        index: false,
        follow: true,
      })
    }
  })

  it("still canonicalises the unsearched views", async () => {
    // The other half of the rule: removing the canonical from a search must not
    // remove it from the pages that genuinely duplicate a category page.
    expect(canonical(await head({ lane: "separate" }))).toBe(
      "https://khatpodcast.com/categories/%D8%B3%D8%A7%D9%84%D9%81%D8%A9",
    )
    expect(canonical(await head({ category: "سالفة" }))).toBe(
      "https://khatpodcast.com/categories/%D8%B3%D8%A7%D9%84%D9%81%D8%A9",
    )
    expect(canonical(await head({}))).toBe("https://khatpodcast.com/episodes")
    expect((await head({ lane: "separate" })).robots).toBeUndefined()
  })

  it("treats a whitespace-only search as no search at all", async () => {
    // `?search=%20` reaches the body as "no query" — the page trims it — so the
    // head must not declare the page unindexable on the strength of a space.
    const meta = await head({ search: "   ", lane: "separate" })
    expect(meta.robots).toBeUndefined()
    expect(canonical(meta)).toContain("/categories/")
  })
})
