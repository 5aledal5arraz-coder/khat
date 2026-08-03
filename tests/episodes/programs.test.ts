/**
 * The archive's lane rules — the classification, and the copy that has to
 * follow it.
 *
 * `lib/episodes/programs.ts` shipped with no tests at all, which is how four
 * separate things it decides went wrong at once: a tab and a card badge naming
 * the same six rows differently, a note calling the longest rows in the archive
 * "short", the one lane a visitor lands on by default never naming the podcast,
 * and a <title> contradicting the body of its own page. None of those is a
 * rendering bug — every one of them is this module answering a question, and
 * every one of them is checkable here without a browser or a database.
 */
import { describe, it, expect } from "vitest"

import {
  categoryMetadata,
  laneLabel,
  laneNote,
  laneOfCategorySlug,
  laneTag,
  laneUnitNoun,
  unresolvedLaneExceptions,
} from "@/lib/episodes/programs"
import type { EpisodeCategory } from "@/types/database"

const cat = (name: string, slug: string, id: string): EpisodeCategory => ({
  id,
  name,
  slug,
  sort_order: 0,
  created_at: "2026-01-01T00:00:00.000Z",
})

/** The three categories this archive actually has. */
const SEASON = cat("الموسم الاول", "الموسم-الاول", "c1")
const SALFA = cat("سالفة", "سالفة", "c2")
const CLIPS = cat("مقاطع خط", "مقاطع-خط", "c3")
const ALL = [SEASON, SALFA, CLIPS]

describe("laneOfCategorySlug", () => {
  it("puts each of the three real categories in its own lane", () => {
    expect(laneOfCategorySlug(SEASON.slug)).toBe("khat")
    expect(laneOfCategorySlug(SALFA.slug)).toBe("separate")
    expect(laneOfCategorySlug(CLIPS.slug)).toBe("clips")
  })

  it("sends an unknown or absent slug to خط, so nothing falls out of the archive", () => {
    expect(laneOfCategorySlug("الموسم-الثاني")).toBe("khat")
    expect(laneOfCategorySlug(null)).toBe("khat")
    expect(laneOfCategorySlug(undefined)).toBe("khat")
  })

  it("DOES NOT survive a one-letter edit to the slug — the declared hole", () => {
    // ة→ه. This is not a wish-list item, it is the documented limit of the
    // "unknown ⇒ خط" rule, and it is pinned here so that a later change which
    // fixes it (a stable id or a `kind` column) shows up as this test failing
    // rather than as nothing at all. Until then: 16 episodes of a separate
    // programme silently become a season of خط.
    expect(laneOfCategorySlug("سالفه")).toBe("khat")
  })
})

describe("unresolvedLaneExceptions — the cheap half of that hole", () => {
  it("says nothing while every enumerated slug still resolves", () => {
    expect(unresolvedLaneExceptions(ALL)).toEqual([])
  })

  it("names the slug that stopped resolving after the ة→ه edit", () => {
    const renamed = [SEASON, cat("سالفة", "سالفه", "c2"), CLIPS]
    expect(unresolvedLaneExceptions(renamed)).toEqual(["سالفة"])
  })

  it("names the clips slug too — it is the same kind of key", () => {
    expect(unresolvedLaneExceptions([SEASON, SALFA])).toEqual(["مقاطع-خط"])
  })

  it("stays silent on an empty list", () => {
    // A page whose category fetch failed has nothing to say about categories.
    // Warning there would fire on every error path and train everyone to
    // ignore it — which is how a warning becomes decoration.
    expect(unresolvedLaneExceptions([])).toEqual([])
  })
})

describe("laneLabel — one name per thing, on one screen", () => {
  it("calls the clips lane what its cards call it", () => {
    // The tab read «مقاطع من الحلقات» while every card under it carried the
    // badge «مقاطع خط», i.e. the category's own name out of the database. The
    // badge cannot change without a write, so the tab is the one that yields.
    expect(laneLabel("clips", ALL)).toBe(CLIPS.name)
  })

  it("calls the separate lane by its programme's name", () => {
    expect(laneLabel("separate", ALL)).toBe(SALFA.name)
  })

  it("DOES NOT rename خط to its only season", () => {
    // خط also has exactly one category right now. Letting the adaptive rule
    // reach it would put «الموسم الاول» on the lane tab — a season standing in
    // for the programme, which is the exact confusion this module removes, and
    // it would silently change back when season two arrives.
    expect(laneLabel("khat", ALL)).toBe("حلقات خط")
  })

  it("falls back to the kind once a lane holds more than one programme", () => {
    const second = cat("برنامج ثاني", "برنامج-ثاني", "c4")
    // Not in SEPARATE_PROGRAM_SLUGS yet, so this is the state right after a
    // second programme is enumerated: the adaptive name stops being right.
    expect(laneLabel("separate", [SALFA, second, SEASON])).toBe("سالفة")
  })
})

describe("laneTag", () => {
  it("keeps «برنامج منفصل» on سالفة, whose name explains nothing on its own", () => {
    expect(laneTag("separate")).toBe("برنامج منفصل")
  })

  it("gives clips no tag — it was the tab's own words repeated", () => {
    // «مقتطعة من الحلقات» under a tab reading «مقاطع من الحلقات» was the same
    // sentence twice, said twice by a screen reader, and it made the least
    // important tab the widest element in the row (measured 255px against
    // 94px for خط at 1280).
    expect(laneTag("clips")).toBeNull()
  })

  it("gives خط no tag", () => {
    expect(laneTag("khat")).toBeNull()
  })
})

describe("laneNote", () => {
  it("names the podcast on the lane a visitor lands on by default", () => {
    // The argument for returning null here was "the page header already says
    // so". It does not: the h1 is «الحلقات», the eyebrow «أرشيف الحوارات», and
    // the buttons name kinds. This was the only lane that never said خط.
    const note = laneNote("khat", ALL)
    expect(note).not.toBeNull()
    expect(note).toContain("خط")
  })

  it("does not call the clips short", () => {
    // Measured over the published archive: clips run 8–24 min (mean 17) and
    // the سالفة episodes one tab away run 5–15 (mean 9). «قصيرة» described the
    // wrong axis, and it was measurably backwards.
    const note = laneNote("clips", ALL)
    expect(note).not.toContain("قصيرة")
    expect(note).toContain("مو حلقات كاملة")
  })

  it("says سالفة is not خط", () => {
    expect(laneNote("separate", ALL)).toContain("مو من حلقات بودكاست خط")
  })
})

describe("laneUnitNoun", () => {
  it("counts clips as مقاطع and everything else as حلقات", () => {
    expect(laneUnitNoun("clips")).toBe("مقطع")
    expect(laneUnitNoun("khat")).toBe("حلقة")
    expect(laneUnitNoun("separate")).toBe("حلقة")
  })
})

describe("categoryMetadata — the head must agree with the body", () => {
  it("does not call سالفة a category of خط's episodes", () => {
    // What shipped: <title>سالفة — خط بودكاست</title> and «كل حلقات بودكاست خط
    // ضمن تصنيف سالفة» over a page whose body reads «سالفة» برنامج مستقل — مو
    // من حلقات بودكاست خط. This page carries the canonical, so the wrong half
    // is the half that gets indexed.
    const meta = categoryMetadata(SALFA, ALL)
    expect(meta.description).not.toContain("كل حلقات بودكاست خط ضمن")
    expect(meta.description).toBe(laneNote("separate", ALL))
    expect(meta.title).toContain("برنامج منفصل")
  })

  it("does not call the clips حلقات", () => {
    const meta = categoryMetadata(CLIPS, ALL)
    expect(meta.description).not.toMatch(/كل حلقات بودكاست خط ضمن/)
    expect(meta.description).toBe(laneNote("clips", ALL))
  })

  it("keeps the true copy for an actual season of خط", () => {
    const meta = categoryMetadata(SEASON, ALL)
    expect(meta.title).toBe(SEASON.name)
    expect(meta.description).toContain("كل حلقات بودكاست خط")
  })

  it("never spells the brand — app/layout.tsx appends it to every title", () => {
    // `title.template` is `%s | بودكاست خط`, so `${name} — خط بودكاست` rendered
    // as «سالفة — خط بودكاست | بودكاست خط»: the brand twice in one tab, in the
    // wave that removed exactly that from five other surfaces.
    for (const category of ALL) {
      expect(
        categoryMetadata(category, ALL).title,
        `${category.name} spells the brand itself`,
      ).not.toMatch(/بودكاست\s*خط|خط\s*بودكاست/)
    }
  })
})
