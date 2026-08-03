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
 *
 * ── AND THE FIRST VERSION OF THIS FILE COVERED ONLY THE COPY ──────────────
 * It tested every string this module returns and not one of the decisions the
 * pages are actually built on. Measured by mutation: 26 mutations of
 * `lib/episodes/programs.ts`, 10 of them survived — including `filterLane`
 * inverted and `filterLane` not filtering at all, which is the function
 * `app/episodes/page.tsx` uses to decide what the archive shows. The homepage
 * lane could have started serving سالفة and clips with the whole suite green.
 *
 * A test file that only checks the copy is a test file that passes while the
 * feature is dead — the same shape as `tests/db-mock.ts` ignoring Drizzle's
 * projection. The blocks below cover the classification and the parsing, which
 * is where the behaviour lives.
 */
import { describe, it, expect, vi, afterEach } from "vitest"

import {
  DEFAULT_LANE,
  PROGRAM_LANES,
  categoryMetadata,
  filterLane,
  khatSeasonGroups,
  laneCategories,
  laneGroups,
  laneLabel,
  laneNote,
  laneOfCategorySlug,
  laneOfEpisode,
  laneTag,
  laneUnitNoun,
  parseLane,
  unresolvedLaneExceptions,
} from "@/lib/episodes/programs"
import { CLIPS_CATEGORY_SLUG } from "@/lib/episodes/clips"
import { makeEpisode } from "../fixtures"
import type { Episode, EpisodeCategory } from "@/types/database"

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

/** An episode in a category, as `withCategories: true` returns it. */
const ep = (id: string, category: EpisodeCategory | null): Episode =>
  makeEpisode({ id, category, category_id: category?.id ?? null })

afterEach(() => {
  vi.restoreAllMocks()
})

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

  /**
   * WHY THE ORDER OF THE TWO CHECKS IS NOT TESTED, and why that is not a gap.
   *
   * Swapping `clips` and `separate` inside `laneOfCategorySlug` survives every
   * test in this file, and it always will: the two checks can only disagree
   * about a slug that is BOTH `CLIPS_CATEGORY_SLUG` and a member of
   * `SEPARATE_PROGRAM_SLUGS`, and no such slug exists. The mutation is
   * semantically equivalent, so a test written to kill it would be a test
   * written to pin an implementation detail — the exact "test the code back to
   * itself" move that makes a suite feel thorough and prove nothing.
   *
   * What IS worth pinning is the precondition that makes the order irrelevant.
   * If the clips slug is ever added to the exception set, one of the two lanes
   * silently stops existing and WHICH one depends on a line order nobody thinks
   * of as load-bearing. That is checkable, and it is checked here.
   */
  it("keeps the two exception families disjoint — the reason their order cannot matter", () => {
    expect(laneOfCategorySlug(CLIPS_CATEGORY_SLUG)).toBe("clips")
    // The one input that would make the order observable. If this ever becomes
    // "separate", the clips lane has been swallowed by the exception set.
    expect(laneOfCategorySlug(CLIPS_CATEGORY_SLUG)).not.toBe("separate")
  })
})

describe("laneOfEpisode — the lane comes off the SLUG, not the name", () => {
  it("reads each episode's category slug", () => {
    expect(laneOfEpisode(ep("e1", SEASON))).toBe("khat")
    expect(laneOfEpisode(ep("e2", SALFA))).toBe("separate")
    expect(laneOfEpisode(ep("e3", CLIPS))).toBe("clips")
  })

  it("does NOT classify by the category's display name", () => {
    // The slug and the name are different strings — «مقاطع-خط» against «مقاطع
    // خط» — and only the slug is the key this module is built on. Reading the
    // name instead still puts «الموسم الاول» in خط (unknown ⇒ خط), so the
    // default lane looks entirely correct while the other two lanes empty out.
    // That is the failure this asserts against: it is silent by construction.
    const clip = ep("e1", cat("مقاطع خط", CLIPS_CATEGORY_SLUG, "c3"))
    expect(laneOfEpisode(clip)).toBe("clips")

    const salfa = ep("e2", cat("سالفة", "سالفة", "c2"))
    expect(laneOfEpisode(salfa)).toBe("separate")
  })

  it("puts a freshly synced episode with no category in خط, not in a fourth bucket", () => {
    expect(laneOfEpisode(ep("e4", null))).toBe("khat")
    expect(laneOfEpisode(makeEpisode({ id: "e5" }))).toBe("khat")
  })
})

describe("filterLane — what the archive actually shows", () => {
  const rows = [ep("e1", SEASON), ep("e2", SALFA), ep("e3", CLIPS), ep("e4", null)]

  it("keeps only the lane asked for", () => {
    // The whole point of the function, and it survived every mutation the copy
    // tests could throw at it — including being inverted.
    expect(filterLane(rows, "khat").map((e) => e.id)).toEqual(["e1", "e4"])
    expect(filterLane(rows, "separate").map((e) => e.id)).toEqual(["e2"])
    expect(filterLane(rows, "clips").map((e) => e.id)).toEqual(["e3"])
  })

  it("EXCLUDES the other lanes — not just includes its own", () => {
    // `toEqual` above already implies this, but stated separately because the
    // fault that matters is a filter that stops filtering: the خط lane then
    // renders سالفة and the clips beside the real episodes, on the default
    // landing view, with nothing on the page saying so. That is the «الكل ٣٦»
    // bug returning by a different route.
    for (const lane of PROGRAM_LANES) {
      const kept = filterLane(rows, lane)
      expect(kept.length, `${lane} kept the whole archive`).toBeLessThan(rows.length)
      for (const row of kept) expect(laneOfEpisode(row)).toBe(lane)
    }
  })

  it("returns a copy, never the caller's array", () => {
    expect(filterLane(rows, "khat")).not.toBe(rows)
  })

  it("never invents or loses an episode: the three lanes partition the archive", () => {
    // A lane decides WHERE a row is listed, never WHETHER — the module's own
    // rule. Any classification change that drops a row out of every lane makes
    // it vanish from the site, which is the silent-loss shape this codebase
    // keeps paying for.
    const across = PROGRAM_LANES.flatMap((lane) => filterLane(rows, lane).map((e) => e.id))
    expect(across.sort()).toEqual(rows.map((e) => e.id).sort())
  })

  it("warns and returns EVERYTHING when the list was fetched without categories", () => {
    // Without the guard this returns [] — a truthful-looking "no episodes in
    // this lane" for what is really a caller bug — or, worse, classifies every
    // row as خط and looks successful. Showing too much and saying so is the
    // recoverable half.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const raw = [makeEpisode({ id: "e1" }), makeEpisode({ id: "e2" })].map((e) => ({
      ...e,
      category: undefined,
    }))

    const out = filterLane(raw, "clips")

    expect(out.map((e) => e.id)).toEqual(["e1", "e2"])
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0][0]).toContain("withCategories")
  })

  it("says nothing about an empty list", () => {
    // No episodes is not evidence the caller forgot anything, and a warning on
    // every empty page is how a warning becomes decoration.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    expect(filterLane([], "khat")).toEqual([])
    expect(warn).not.toHaveBeenCalled()
  })
})

describe("laneCategories", () => {
  it("returns each lane's own categories, in the admin's order", () => {
    expect(laneCategories(ALL, "khat")).toEqual([SEASON])
    expect(laneCategories(ALL, "separate")).toEqual([SALFA])
    expect(laneCategories(ALL, "clips")).toEqual([CLIPS])
  })

  it("returns nothing for a lane with no categories", () => {
    expect(laneCategories([SEASON], "clips")).toEqual([])
  })
})

describe("khatSeasonGroups / laneGroups — the season row", () => {
  const counts = { c1: 19, c2: 16, c3: 6 }

  it("gives خط its seasons and NOT the other programmes", () => {
    // Dropping the lane filter here puts «سالفة» and «مقاطع خط» into the season
    // row of حلقات خط — a separate programme and a pile of cut-downs offered as
    // seasons of this podcast, which is precisely the flat-chip-row confusion
    // this module was written to end.
    expect(khatSeasonGroups(ALL, counts).map((g) => g.slug)).toEqual([SEASON.slug])
  })

  it("carries the counts through", () => {
    // Keyed by category ID, not slug. Losing them empties the number beside
    // every season name and nothing errors — the row just goes quiet.
    expect(khatSeasonGroups(ALL, counts)[0].count).toBe(19)
  })

  it("leaves the count undefined when the caller has no counts", () => {
    expect(khatSeasonGroups(ALL)[0].count).toBeUndefined()
  })

  it("gives every other lane its own categories as groups, with counts", () => {
    expect(laneGroups(ALL, "separate", counts)).toEqual([
      { slug: SALFA.slug, name: SALFA.name, count: 16 },
    ])
    expect(laneGroups(ALL, "clips", counts)).toEqual([
      { slug: CLIPS.slug, name: CLIPS.name, count: 6 },
    ])
  })

  it("routes the خط lane through khatSeasonGroups", () => {
    expect(laneGroups(ALL, "khat", counts)).toEqual(khatSeasonGroups(ALL, counts))
  })
})

describe("parseLane — `?lane=` is a code constant, not free text", () => {
  it("accepts exactly the three lanes", () => {
    for (const lane of PROGRAM_LANES) expect(parseLane(lane)).toBe(lane)
  })

  it("rejects anything else, so the caller can fall back", () => {
    // Returning the raw string as a ProgramLane is a lie the type system cannot
    // catch: `?lane=khat'` then reaches `filterLane`, matches no episode, and
    // renders an empty archive that reads as a truthful "no episodes".
    expect(parseLane("khatt")).toBeNull()
    expect(parseLane("KHAT")).toBeNull()
    expect(parseLane("../etc")).toBeNull()
    expect(parseLane("")).toBeNull()
    expect(parseLane(undefined)).toBeNull()
    expect(parseLane(null)).toBeNull()
  })

  it("tolerates the whitespace a copy-pasted URL carries", () => {
    expect(parseLane(" clips ")).toBe("clips")
    expect(parseLane("\nkhat")).toBe("khat")
  })
})

describe("PROGRAM_LANES — display order AND the accept-list, at once", () => {
  it("puts خط first, because it is the site", () => {
    expect(PROGRAM_LANES[0]).toBe("khat")
    expect(PROGRAM_LANES[0]).toBe(DEFAULT_LANE)
  })

  it("holds every lane exactly once", () => {
    // This array does double duty — `archive-nav.tsx` renders the tabs from it
    // and `parseLane` validates against it — so a lane missing here does not
    // merely reorder the row: the tab disappears AND every `?lane=` link to it
    // stops resolving. Two failures from one edit that looks cosmetic.
    expect(new Set(PROGRAM_LANES).size).toBe(PROGRAM_LANES.length)
    for (const lane of PROGRAM_LANES) expect(parseLane(lane)).toBe(lane)
    expect([...PROGRAM_LANES].sort()).toEqual(["clips", "khat", "separate"])
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
