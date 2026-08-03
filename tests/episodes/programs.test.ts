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
  LANE_EXCEPTION_SLUGS,
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
  showsGroupRow,
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

  it("matches an exception slug WHOLE — containing one is not being one", () => {
    // The rule reads "a category is خط UNLESS it is one of the two enumerated
    // exceptions", and both checks are equality. Nothing said so, so a widened
    // check — `includes`, `startsWith`, a `some()` over the set — passed every
    // test in this file while quietly annexing categories into a lane they do
    // not belong to. «سالفة الموسم الثاني» is a plausible admin-typed slug and
    // it is a season of خط; under `includes` it becomes a separate programme
    // and disappears from the default landing view.
    expect(laneOfCategorySlug("سالفة-٢")).toBe("khat")
    expect(laneOfCategorySlug("ما-قبل-سالفة")).toBe("khat")
    expect(laneOfCategorySlug(`${CLIPS_CATEGORY_SLUG}-٢`)).toBe("khat")
    expect(laneOfCategorySlug(`أرشيف-${CLIPS_CATEGORY_SLUG}`)).toBe("khat")
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
   * of as load-bearing.
   *
   * ── AND THE FIRST VERSION OF THAT PIN DID NOT PIN IT ──────────────────────
   * It asserted `laneOfCategorySlug(CLIPS_CATEGORY_SLUG)` is "clips" and not
   * "separate" — which is a statement about the ORDER's EFFECT, not about the
   * families being disjoint, and the order is precisely what makes the fault
   * invisible: adding the clips slug to the exception set leaves that answer
   * unchanged, because clips is checked first. Measured — the test stayed
   * green, and what went red instead was an unrelated test about renamed
   * categories, by accident, because the enumerated list came out with a
   * duplicate in it. A guard whose warning arrives from somewhere else is not
   * a guard; it is a coincidence with a good outcome.
   *
   * So the invariant is asserted on the DATA. `LANE_EXCEPTION_SLUGS` is the
   * enumerated list itself, and one slug appearing twice in it IS the fault —
   * no derivation, nothing that a `new Set()` added elsewhere could quietly
   * absorb.
   */
  it("keeps the two exception families disjoint — the reason their order cannot matter", () => {
    expect(
      LANE_EXCEPTION_SLUGS.length - new Set(LANE_EXCEPTION_SLUGS).size,
      `a slug is enumerated in BOTH lane families (${LANE_EXCEPTION_SLUGS.join(", ")}) — ` +
        "one of the two lanes has silently stopped existing, and which one depends " +
        "on the order of the two checks inside laneOfCategorySlug",
    ).toBe(0)
    // …and the classification that the disjointness is what makes order-free.
    expect(laneOfCategorySlug(CLIPS_CATEGORY_SLUG)).toBe("clips")
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

  it("returns a copy, never the caller's array — on BOTH paths", () => {
    // The filtering path copies for free, because `.filter()` does. The
    // WARNING path is the one that has to mean it, and it is the one nothing
    // covered: `return [...list]` mutated to `return list` survived every test
    // here while the doc comment two lines above it still promised a copy.
    // A caller that sorts what it gets back would then be reordering the
    // cached archive snapshot in place.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    expect(filterLane(rows, "khat")).not.toBe(rows)

    const raw = [makeEpisode({ id: "e1" })].map((e) => ({ ...e, category: undefined }))
    expect(filterLane(raw, "clips")).not.toBe(raw)
    expect(warn).toHaveBeenCalled()
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

  it("treats a category that did NOT resolve as uncategorised, not as categorised", () => {
    // `attachCategories` in lib/queries/episodes.ts writes
    // `category: categoriesById.get(ep.category_id) ?? null` — so a row whose
    // category_id points at a category that no longer exists arrives with the
    // FIELD PRESENT and the value null. The check here is
    // `!== undefined && !== null`, and dropping either half is a live mutation:
    // with `!== undefined` alone, a list of null-category rows reads as
    // "categorised", the warning never fires, and every row classifies as خط —
    // the clips and سالفة tabs empty out while the default landing view looks
    // entirely correct. That is the exact silent misclassification the warning
    // exists for, arriving through the other of the two null-ish states.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const dangling = [makeEpisode({ id: "e1" }), makeEpisode({ id: "e2" })].map((e) => ({
      ...e,
      category_id: "gone",
      category: null,
    }))

    const out = filterLane(dangling, "clips")

    expect(out.map((e) => e.id)).toEqual(["e1", "e2"])
    expect(warn).toHaveBeenCalledTimes(1)
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

  it("gives each season its own NAME, not its slug or its id", () => {
    // Only the slugs were ever asserted for the خط lane, so `name: c.name`
    // could become `c.slug` and survive — and the two are different strings by
    // construction («الموسم الاول» against «الموسم-الاول»). The season chip
    // would then read with hyphens where a reader expects spaces, on the one
    // control this lane has, with the whole suite green. The other two lanes
    // were checked whole; خط was the one that was not.
    expect(khatSeasonGroups(ALL, counts)).toEqual([
      { slug: SEASON.slug, name: SEASON.name, count: 19 },
    ])
  })

  it("keeps the admin's own order once there is more than one season", () => {
    // UNTESTABLE WITH ONE SEASON, which is why reversing the list survived:
    // every assertion about the خط lane ran against a single-element array,
    // where order is not a property. This is the shape of the archive the
    // moment «الموسم الثاني» is added — the case the whole module exists to
    // make possible — and it is the only one in which the season row renders
    // at all (see showsGroupRow).
    const second = cat("الموسم الثاني", "الموسم-الثاني", "c5")
    const groups = khatSeasonGroups([SEASON, SALFA, second, CLIPS], { ...counts, c5: 7 })
    expect(groups.map((g) => g.name)).toEqual(["الموسم الاول", "الموسم الثاني"])
    expect(groups.map((g) => g.count)).toEqual([19, 7])
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
    // DECLARED EQUIVALENT TODAY, and pinned anyway because that expires.
    // Deleting the `lane === "khat"` branch from `laneGroups` survives this
    // and every other test here — measured — because the generic branch maps
    // `laneCategories(categories, "khat")` into exactly the same shape.
    // No test can tell the two apart while they compute the same thing, and no
    // test should: the delegation only becomes observable when
    // `khatSeasonGroups` stops deriving seasons from categories and starts
    // deriving them from `episodes.season` (the migration written out at the
    // switch point). On that day this assertion is what fails if `laneGroups`
    // was left mapping categories behind its back.
    expect(laneGroups(ALL, "khat", counts)).toEqual(khatSeasonGroups(ALL, counts))
  })
})

describe("showsGroupRow — the rule with an expiry date on it", () => {
  const counts = { c1: 19, c2: 16, c3: 6 }

  it("hides the row while there is nothing to choose between", () => {
    // Zero and one are both "no choice". One is the live case: خط has exactly
    // one season today, so the season row does not render anywhere on the site
    // — which is half the argument for the cross-canonical `groupHref` on
    // /categories/[slug], and the half that expires.
    expect(showsGroupRow([])).toBe(false)
    expect(showsGroupRow(khatSeasonGroups(ALL, counts))).toBe(false)
  })

  it("shows it the moment a second season exists", () => {
    // `> 1` mutated to `>= 1` renders a one-chip "filter" that filters nothing,
    // beside a tab that already means the same thing — the duplicate control
    // the «الكل» chip was removed for. `>= 2` is the same rule; `> 2` swallows
    // the first real choice a visitor ever gets.
    const second = cat("الموسم الثاني", "الموسم-الثاني", "c5")
    expect(showsGroupRow(khatSeasonGroups([SEASON, second, SALFA, CLIPS], counts))).toBe(true)
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

  it("reports the SLUG that stopped resolving, not the display name", () => {
    // The slug is the key the lane rule is built on and the thing an operator
    // has to go and fix in /admin/episodes → التصنيفات. Reading `c.name` here
    // instead builds the "present" set out of the wrong column, so every
    // enumerated slug reads as missing and the warning fires on a healthy
    // archive — a warning that cries every render is one everybody turns off.
    expect(unresolvedLaneExceptions(ALL)).toEqual([])
    expect(unresolvedLaneExceptions([cat("سالفة", "سالفة", "c2"), CLIPS])).toEqual([])
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

  it("FOLLOWS the clips category when it is renamed — the rule, not the coincidence", () => {
    // The test above proves nothing on its own: `LANE_LABEL.clips` is the
    // string «مقاطع خط» and so is the category's name, so removing `clips`
    // from LANE_NAMES_ITS_ONLY_MEMBER — deleting the adaptive rule for this
    // lane outright — passes it. Measured: that mutation survived the whole
    // file. The two strings agree today by design and the rule is what keeps
    // them agreeing tomorrow, which only shows when they are made to differ.
    //
    // Renaming a category is one field in /admin/episodes → التصنيفات and does
    // not touch the slug, so this is a state Khaled can reach this afternoon.
    // Without the adaptive rule the tab would read «مقاطع خط» over cards
    // badged «مقاطع» — the same two-names-for-one-thing bug, back again.
    const renamed = cat("مقاطع", CLIPS_CATEGORY_SLUG, "c3")
    expect(laneLabel("clips", [SEASON, SALFA, renamed])).toBe("مقاطع")
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

  it("does not let an UN-enumerated programme join the lane and rename it", () => {
    // THE TITLE OF THIS TEST USED TO SAY THE OPPOSITE OF ITS ASSERTION. It read
    // "falls back to the kind once a lane holds more than one programme" and
    // then expected «سالفة» — the adaptive name, i.e. NOT the fallback. The
    // setup is why: «برنامج-ثاني» is not in SEPARATE_PROGRAM_SLUGS, so it is a
    // season of خط (unknown ⇒ خط) and the separate lane still holds exactly
    // one. The assertion was right and the sentence above it was not, which is
    // worse than an untested branch: the next reader takes the branch as
    // covered. What it really pins is that adding a category does NOT quietly
    // move a lane's name, and that is worth pinning, so it stays and says so.
    const second = cat("برنامج ثاني", "برنامج-ثاني", "c4")
    expect(laneOfCategorySlug(second.slug)).toBe("khat")
    expect(laneLabel("separate", [SALFA, second, SEASON])).toBe("سالفة")
  })

  /**
   * AND THE `own.length === 1` BRANCH ITSELF CANNOT BE REACHED TODAY — stated
   * as a fact with its evidence, not waved past.
   *
   * `own.length === 1` → `>= 1` survives every test in this file and always
   * will, for the same reason the check ORDER inside `laneOfCategorySlug`
   * does: two preconditions make the two spellings identical.
   *
   *   · `episode_categories.slug` is UNIQUE (lib/db/schema/episodes.ts:7), so
   *     no two categories can carry the same slug;
   *   · each adaptive lane is keyed to exactly one slug — `clips` to the single
   *     `CLIPS_CATEGORY_SLUG`, `separate` to a one-member set.
   *
   * Together: an adaptive lane holds AT MOST one category, so `=== 1` and
   * `>= 1` agree on every input that can exist. Writing a test that kills the
   * mutation would mean handing `laneLabel` two categories with the same slug —
   * a state Postgres forbids — i.e. pinning an implementation detail against an
   * impossible input, which is the move P03 taught us not to make.
   *
   * So what is pinned is the PRECONDITION. The moment a second separate
   * programme is enumerated, the branch goes live and this fails, naming it.
   */
  it("pins the precondition that makes the adaptive-name branch unreachable", () => {
    expect(
      LANE_EXCEPTION_SLUGS.length,
      "a second lane exception has been enumerated. `own.length === 1` in laneLabel " +
        "and laneNote is now a LIVE branch — write the real >1 test and delete this one",
    ).toBe(2)
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

  it("says سالفة is not خط, AND names it", () => {
    // `توقّع toContain("مو من حلقات بودكاست خط")` alone is satisfied by BOTH
    // branches — the singular «سالفة» برنامج مستقل — مو من حلقات بودكاست خط
    // and the plural «برامج مستقلة — مو من حلقات بودكاست خط» end in the same
    // clause. Measured: inverting the branch condition survived. With one
    // programme in the lane the plural is simply wrong copy about a single
    // named thing, and naming it is the entire reason the branch exists.
    const note = laneNote("separate", ALL)
    expect(note).toContain("مو من حلقات بودكاست خط")
    expect(note).toContain(`«${SALFA.name}»`)
    expect(note).not.toContain("برامج مستقلة")
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

  it("keeps the true copy for an actual season of خط — and says WHICH season", () => {
    // `toContain("كل حلقات بودكاست خط")` is a prefix of the real string, so
    // dropping «ضمن «الموسم الاول»» off the end passed it. Measured: that
    // mutation survived. Every season of خط would then carry the identical
    // meta description — the definition of a duplicate-description problem for
    // a search engine, on the one page family that has more than one member as
    // soon as season two lands.
    const meta = categoryMetadata(SEASON, ALL)
    expect(meta.title).toBe(SEASON.name)
    expect(meta.description).toContain("كل حلقات بودكاست خط")
    expect(meta.description).toContain(`«${SEASON.name}»`)
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
