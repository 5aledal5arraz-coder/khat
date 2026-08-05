import { readFileSync } from "fs"
import path from "path"
import { describe, expect, it } from "vitest"

/**
 * The partner band, and the failure it is a fix for.
 *
 * `trusted_partners.show_on_homepage` → `getHomepagePartners()` →
 * `getCachedHomepagePartners` → **nobody**. Every link existed except the last
 * one, so ticking the flag in the admin changed nothing on any public page and
 * nothing anywhere reported that. 2828 tests were green through all of it,
 * because a query with no caller breaks no assertion.
 *
 * These are SOURCE-LEVEL assertions on purpose. The thing that went wrong was
 * not a wrong value — it was an absent call, and a rendering test cannot fail
 * on a component that is never mounted. What follows checks the wiring itself:
 * the pages that must read the query, and the treatment the logos must carry.
 */

const root = process.cwd()
const read = (p: string) => readFileSync(path.join(root, p), "utf8")

const HOME = read("app/page.tsx")
const SEASON = read("app/categories/[slug]/page.tsx")
const STRIP = read("components/sponsors/sponsor-strip.tsx")
const EPISODE_SPONSOR = read("components/episodes/episode-sponsor.tsx")
const PARTNER_ACTIONS = read("app/admin/partnerships/actions.ts")

describe("the band reaches a visitor — the link that was missing", () => {
  it("the homepage reads the partner query AND renders the band", () => {
    expect(HOME).toContain("getCachedHomepagePartners")
    expect(HOME).toContain("<SponsorStrip")
  })

  it("the season page reads it too", () => {
    expect(SEASON).toContain("getCachedHomepagePartners")
    expect(SEASON).toContain("<SponsorStrip")
  })

  it("the season page asks only for the خط lane", () => {
    // /categories/* also serves «مقاطع خط» and «سالفة». A season's partners
    // are not automatically theirs; Khaled asked for the season.
    expect(SEASON).toMatch(/lane === "khat"\s*\n?\s*\?\s*getCachedHomepagePartners/)
  })

  it("the episode page keeps its own per-episode sponsor", () => {
    // This one was never dead — it is the only sponsor surface that worked.
    // Asserted so a refactor of the other two cannot quietly take it out.
    const EPISODE = read("components/episodes/episode-page-client.tsx")
    expect(EPISODE).toContain("<EpisodeSponsor")
  })

  it("neither page can 500 because a partner query failed", () => {
    for (const [name, src] of [["home", HOME], ["season", SEASON]] as const) {
      const call = src.slice(src.indexOf("getCachedHomepagePartners()"))
      expect(call.slice(0, 60), `${name} does not catch`).toContain(".catch(")
    }
  })
})

describe("the treatment — a sponsor's palette must not land on the page", () => {
  /**
   * Khaled, 2026-08-05: «الالوان والخط هم هوية بودكاست خط، ممنوع … استخدام
   * الوان غير موجوده في ملف الهويه». A logo is a trademark in its owner's
   * colours — the one thing here that is neither ours to adopt nor ours to
   * repaint. Greyscale answers the colour; `mix-blend-multiply` answers the
   * white box around an opaque logo file, which a CSS mask would have turned
   * into a solid slab instead.
   */
  it.each([
    ["the season band", STRIP],
    ["the per-episode sponsor", EPISODE_SPONSOR],
  ])("%s renders logos greyscale and multiplied", (_label, src) => {
    expect(src).toContain("grayscale")
    expect(src).toContain("mix-blend-multiply")
  })

  it("both surfaces agree — a logo cannot be monochrome on one and colour on the other", () => {
    const treated = (src: string) =>
      /grayscale/.test(src) && /mix-blend-multiply/.test(src) && /grayscale-0/.test(src)
    expect(treated(STRIP)).toBe(true)
    expect(treated(EPISODE_SPONSOR)).toBe(true)
  })

  it("hover restores the real logo, which is the sponsor's due", () => {
    expect(STRIP).toContain("group-hover:grayscale-0")
    expect(EPISODE_SPONSOR).toContain("hover:grayscale-0")
  })

  it("introduces no colour of its own", () => {
    const stock =
      /\b(?:bg|text|border|from|via|to|fill|ring)-(?:red|orange|amber|yellow|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|pink|rose|slate|gray|zinc|neutral|stone|white|black)(?:-\d{2,3})?\b/g
    expect(STRIP.match(stock) ?? []).toEqual([])
  })
})

describe("an empty band never renders", () => {
  it("returns null on an empty partner list", () => {
    // The slot must not announce itself before anyone fills it — the table is
    // empty today, on local and on production both.
    expect(STRIP).toMatch(/if \(!partners\.length\) return null/)
  })
})

describe("editing a partner refreshes what a visitor sees", () => {
  it("expires the tag, not just the path", () => {
    // The data lives in `unstable_cache` under a tag; `revalidatePath` alone
    // leaves it stale for the full 30-minute TTL with nothing saying so.
    expect(PARTNER_ACTIONS).toContain('invalidate("homepage")')
  })

  it("revalidates the season pages as a layout, not one named slug", () => {
    // The set of season pages is a row count in Postgres. Naming slugs means a
    // new season stops refreshing and nothing reports it.
    expect(PARTNER_ACTIONS).toContain('revalidatePath("/categories/[slug]", "layout")')
  })
})
