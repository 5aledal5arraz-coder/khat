/**
 * The archive holds THREE KINDS OF THING, not one flat list of categories.
 *
 * `episode_categories` is a flat table, so every row in it is a peer of every
 * other row. The three rows we actually have are not peers at all:
 *
 *   الموسم الاول  — a SEASON of بودكاست خط. The archive's own episodes.
 *   سالفة         — a SEPARATE PROGRAM. Not خط.
 *   مقاطع خط      — CLIPS cut out of خط episodes. Derived, not original.
 *
 * Flat data made them render as a flat chip row, which is why the filter said
 * «الكل ٣٦» next to «الموسم الاول ١٩ · سالفة ١٦ · مقاطع خط ٦»: «الكل» silently
 * meant "everything except clips" and nothing on the page said so. Grouping the
 * rows by KIND — a "lane" — is what makes the archive readable, and it is what
 * lets «الموسم الثاني» arrive as another season of خط instead of as a fourth
 * peer standing beside a different program and a pile of cut-downs.
 *
 * Only `/episodes` (and the chrome on `/categories/[slug]`) reads this. Nothing
 * here writes anything, and no episode is ever excluded from the site by it —
 * a lane decides WHERE a row is listed, never WHETHER.
 */

import type { Episode, EpisodeCategory } from "@/types/database"
import { CLIPS_CATEGORY_SLUG } from "./clips"

export type ProgramLane = "khat" | "separate" | "clips"

/** Display order of the lanes. خط first — it is the site. */
export const PROGRAM_LANES = ["khat", "separate", "clips"] as const satisfies readonly ProgramLane[]

/** The lane a visitor lands on with no `?lane=` and no `?category=`. */
export const DEFAULT_LANE: ProgramLane = "khat"

/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  THE SWITCH POINT — the only place a category is classified.             ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * NOT A LOOKUP OF «الموسم الاول». Deriving خط by matching that string would
 * break the moment season two arrives, because its name is a human-typed
 * Arabic string that will differ (note that the CURRENT one is «الموسم الاول»,
 * with no hamza — nobody should have to guess the spelling of the next one).
 *
 * The rule is the other way round and needs no future names: a category is a
 * season of خط UNLESS it is one of the two enumerated exceptions below. Add a
 * category → it is خط. Add «الموسم الثاني», «الموسم الثالث», «موسم خاص» → all
 * خط, no code change. Only a genuinely new KIND of thing (another separate
 * program, another clip bucket) needs an edit, and it is an edit to one Set.
 *
 * MOVING TO REAL SEASONS (`episodes.season`), when Khaled fills that column:
 * this file stays the only thing that changes shape, and it is two exports —
 *   1. `khatSeasonGroups()` below returns the season list. Today it derives it
 *      from the categories in the خط lane; then it would derive it from the
 *      distinct `episodes.season` values.
 *   2. `ArchiveGroup.slug` is what `/episodes` hands to
 *      `getEpisodes({ category })`. A real-season group would hand a season
 *      number to a `season` filter instead — `getEpisodes` already takes
 *      `season?: number` — at ONE call site, `app/episodes/page.tsx`, marked
 *      there with a pointer back to here.
 *
 * THREE MORE FILES HAVE TO MOVE WITH IT, and none of them is obvious from the
 * two exports above. They are listed here because the previous version of this
 * comment said "nothing else in the tree knows how a season is decided", and
 * that was not true:
 *
 *   · `components/episodes/archive-nav.tsx` renders the groups. It asks for
 *     nothing but `ArchiveGroup`, which is the point — but the season row's
 *     visibility rule (`groups.length > 1`) is a season decision living there.
 *     MEASURED: with one season, that rule is false, so THE SEASON ROW DOES
 *     NOT RENDER ANYWHERE ON THE SITE TODAY. Nothing about choosing between
 *     seasons can be tested through the UI until a second one exists — the
 *     control is not merely empty, it is absent — so the group logic is
 *     covered at this module's own boundary (tests/episodes/programs.test.ts)
 *     and a green suite is NOT evidence that the row works.
 *   · `app/categories/[slug]/page.tsx` renders the same nav from a page whose
 *     only episode list is `getEpisodes({ category })` — ALREADY FILTERED to
 *     one category. Deriving season groups from an episode list would give this
 *     page exactly one group and hide the row, silently and only here, while
 *     /episodes looks correct. Whatever replaces `khatSeasonGroups` must take
 *     its input from something request-wide, not from the page's own list.
 *   · `components/episodes/episode-hero.tsx` prints «الموسم {episode.season}»
 *     straight off the column with no question about the lane. Measured today
 *     that branch never renders — 0 rows have `season` set — so filling the
 *     column is what switches it on, and on the day it does, a سالفة or a clip
 *     row carrying a stray season number would print «الموسم N» on a programme
 *     that has no seasons. It needs `laneOfEpisode(ep) === "khat"` first.
 *
 * AND A SEASON IS A PROPERTY OF خط ALONE — do not build the migration on the
 * assumption that every row gets one. Planned fill:
 *
 *   الموسم الاول (19)  →  season = 1
 *   سالفة        (16)  →  season stays NULL — a different program, not a
 *                          season of خط
 *   مقاطع خط      (6)  →  season stays NULL — derived from episodes, not an
 *                          episode
 *
 * So a NULL season is a correct, meaningful answer, not missing data: it means
 * "this is not a خط season episode". Anything that reads the column must ask
 * the lane first — `laneOfEpisode(ep) === "khat"` — and treat NULL inside the
 * خط lane (a synced episode not yet assigned) as "no season yet", which is a
 * third state again. A `season IS NULL` test alone conflates all three.
 *
 * ── THE RULE RUNS ONE WAY, AND THE OTHER WAY IS UNGUARDED ──────────────────
 * "Unknown ⇒ خط" protects ADDITIONS: a new category cannot fall out of the
 * archive. It gives no protection at all in the opposite direction, and the
 * opposite direction is one keystroke in the admin. This set is keyed on a
 * human-typed Arabic SLUG that Khaled can edit from
 * /admin/episodes → التصنيفات, and Arabic has more than one way to end a word:
 *
 *   laneOfCategorySlug("سالفة") → "separate"   ✅ 16 episodes, own program
 *   laneOfCategorySlug("سالفه") → "khat"       🔴 the same 16 become a season
 *                                                 of خط, silently
 *
 * ة→ه is the single most common Arabic typo there is. No error, no empty page,
 * nothing in any log: the tab «سالفة» just disappears and its 16 episodes
 * reappear inside حلقات خط as though they had always been ours. `laneNote`
 * stops saying «برنامج مستقل» because there is no separate lane left to say it
 * about.
 *
 * `unresolvedLaneExceptions()` below is the cheap half of the answer: an
 * enumerated slug that matches no category is either a rename or a typo, and
 * it is the one moment the fault is detectable. It WARNS, it does not correct —
 * the episodes still move. THE REAL FIX is a stable key: `episode_categories`
 * has an `id`, and pinning this set to ids (or to a `kind` column) would let
 * the slug be edited without moving anything between lanes. That is a schema
 * change and therefore Khaled's call, so this is a DECLARED HOLE and not an
 * oversight — do not read the one-way rule above as covering it.
 */
const SEPARATE_PROGRAM_SLUGS: ReadonlySet<string> = new Set([
  // «سالفة» — a different program that happens to live in the same table.
  // Khaled has confirmed he is not expanding it, so it gets a labelled tab
  // inside this archive rather than an identity of its own.
  "سالفة",
])

/** The lane a category slug belongs to. Unknown/absent slug ⇒ خط. */
export function laneOfCategorySlug(slug: string | null | undefined): ProgramLane {
  if (!slug) return DEFAULT_LANE
  if (slug === CLIPS_CATEGORY_SLUG) return "clips"
  if (SEPARATE_PROGRAM_SLUGS.has(slug)) return "separate"
  return DEFAULT_LANE
}

/**
 * The lane an episode belongs to.
 *
 * An episode with NO category is خط, deliberately: a freshly synced episode has
 * `category_id = null` until an admin assigns one, and dropping it into a
 * fourth invisible bucket would make it vanish from the archive — the exact
 * silent-loss shape this codebase keeps paying for. It lists under خط with no
 * season, which is what it is.
 *
 * REQUIRES A LIST FETCHED WITH `withCategories: true`, same as `isClip()`.
 * `filterLane()` below asserts that rather than assuming it.
 */
export function laneOfEpisode(ep: Episode): ProgramLane {
  return laneOfCategorySlug(ep.category?.slug)
}

/**
 * Keep only the episodes in one lane.
 *
 * Returns a COPY, and warns instead of silently returning "no episodes in this
 * lane" when the caller forgot `withCategories` — a list with no resolved
 * categories would otherwise classify every row as خط and look successful.
 */
export function filterLane(list: Episode[], lane: ProgramLane): Episode[] {
  const categorised = list.some((ep) => ep.category !== undefined && ep.category !== null)
  if (list.length > 0 && !categorised) {
    console.warn(
      "[episodes] filterLane() received a list with no resolved categories — " +
        "fetch it with `withCategories: true` or every episode reads as خط.",
    )
    return [...list]
  }
  return list.filter((ep) => laneOfEpisode(ep) === lane)
}

/** The categories that belong to a lane, in the admin's own order. */
export function laneCategories(
  categories: EpisodeCategory[],
  lane: ProgramLane,
): EpisodeCategory[] {
  return categories.filter((c) => laneOfCategorySlug(c.slug) === lane)
}

/**
 * The enumerated exception slugs that match no category any more.
 *
 * The cheap protection for the reverse-direction hole declared at the switch
 * point. A slug in the exception list that resolves to nothing is either a
 * rename or the ة→ه typo, and either way its episodes have just moved into خط
 * without a word. This is the only moment that is detectable: afterwards the
 * data is simply "16 more خط episodes" and looks entirely correct.
 *
 * Same shape as `filterLane`'s warning — it reports, it does not correct.
 * Guessing which category the operator MEANT is how a taxonomy silently
 * reclassifies itself, and one wrong guess is worse than the typo.
 *
 * Empty list in, empty list out: a page that failed to load its categories has
 * nothing to say about them, and warning there would fire on every error path.
 */
export function unresolvedLaneExceptions(categories: EpisodeCategory[]): string[] {
  if (categories.length === 0) return []
  const present = new Set(categories.map((c) => c.slug))
  return [CLIPS_CATEGORY_SLUG, ...SEPARATE_PROGRAM_SLUGS].filter((slug) => !present.has(slug))
}

/**
 * A selectable group inside a lane — a season of خط today, and still a season
 * of خط after `episodes.season` takes over. Deliberately NOT `EpisodeCategory`:
 * the shape the UI renders must not assume where the grouping came from.
 */
export interface ArchiveGroup {
  /** Stable URL key. Today a category slug (see the switch point above). */
  slug: string
  name: string
  /** How many episodes it holds, when the caller knows. */
  count?: number
}

/**
 * The seasons of خط. See the switch point above — this is half of it.
 *
 * `counts` is the existing `category_id → count` map; it is passed in rather
 * than fetched so this stays pure and the page keeps paying for exactly one
 * counts query.
 */
export function khatSeasonGroups(
  categories: EpisodeCategory[],
  counts?: Record<string, number>,
): ArchiveGroup[] {
  return laneCategories(categories, "khat").map((c) => ({
    slug: c.slug,
    name: c.name,
    count: counts?.[c.id],
  }))
}

/** The selectable groups inside any lane. For خط these are its seasons. */
export function laneGroups(
  categories: EpisodeCategory[],
  lane: ProgramLane,
  counts?: Record<string, number>,
): ArchiveGroup[] {
  if (lane === "khat") return khatSeasonGroups(categories, counts)
  return laneCategories(categories, lane).map((c) => ({
    slug: c.slug,
    name: c.name,
    count: counts?.[c.id],
  }))
}

/** `?lane=` → a lane. Unknown or absent ⇒ `null`, and the caller defaults. */
export function parseLane(raw: string | undefined | null): ProgramLane | null {
  if (!raw) return null
  const value = raw.trim()
  return (PROGRAM_LANES as readonly string[]).includes(value) ? (value as ProgramLane) : null
}

/**
 * What a lane is CALLED, and what it needs to say about itself.
 *
 * The label is adaptive where a lane has exactly ONE member, because then the
 * lane and the thing in it are the same thing and inventing a second name for
 * it puts two names for one object on one screen. Measured, that is what
 * shipped: the tab read «مقاطع من الحلقات» while every card underneath it
 * carried the badge «مقاطع خط» — the category's own name, straight from the
 * database — so the archive called the same six rows two different things
 * within one viewport. The badge is the one that cannot change without a write
 * to `episode_categories`, so the tab is the one that yields.
 *
 * `khat` IS EXCLUDED, and not for symmetry's sake: it also has exactly one
 * category today («الموسم الاول»), and the adaptive rule would rename the tab
 * to it. That is precisely the confusion this module removes — a SEASON is a
 * group inside the lane, not the lane. خط keeps a name for the KIND because
 * season two must arrive without the tab changing its label.
 */
const LANE_NAMES_ITS_ONLY_MEMBER: ReadonlySet<ProgramLane> = new Set<ProgramLane>([
  "separate",
  "clips",
])

const LANE_LABEL: Record<ProgramLane, string> = {
  khat: "حلقات خط",
  separate: "برامج أخرى",
  clips: "مقاطع خط",
}

/**
 * Small badge printed on the tab, so the KIND is visible without clicking.
 *
 * CLIPS HAS NONE, deliberately. It used to read «مقتطعة من الحلقات» under a tab
 * reading «مقاطع من الحلقات» — the same words twice, and a screen reader said
 * them both. It was not free either: measured at 1280 the three tabs came out
 * 94px (حلقات خط) · 155px (سالفة) · 255px (the clips tab), so the least
 * important thing in the archive was 2.7× the width of the site's own
 * programme and the visual hierarchy read backwards. The kind is already said
 * once, properly, in `laneNote` below.
 *
 * `separate` keeps «برنامج منفصل» because there the tab says «سالفة» — a name
 * that tells a first-time visitor nothing about what it is.
 */
const LANE_TAG: Record<ProgramLane, string | null> = {
  khat: null,
  separate: "برنامج منفصل",
  clips: null,
}

export function laneLabel(lane: ProgramLane, categories: EpisodeCategory[]): string {
  const own = laneCategories(categories, lane)
  if (LANE_NAMES_ITS_ONLY_MEMBER.has(lane) && own.length === 1) return own[0].name
  return LANE_LABEL[lane]
}

export function laneTag(lane: ProgramLane): string | null {
  return LANE_TAG[lane]
}

/**
 * What one row in this lane IS, as a countable noun — the key into
 * `ARABIC_PLURALS` in `lib/shared/formatters.ts`.
 *
 * The clips lane counts مقاطع, not حلقات. Printing «٦ حلقات» directly beneath
 * a line that says «مو حلقات كاملة» is the label contradicting itself, which is
 * the whole class of fault this module removes.
 */
export function laneUnitNoun(lane: ProgramLane): string {
  return lane === "clips" ? "مقطع" : "حلقة"
}

/**
 * One sentence telling a first-time visitor what they are looking at.
 *
 * خط USED TO GET NONE, on the argument that "it is the site and the page header
 * already says so". THE HEADER DOES NOT SAY SO — measured on the default
 * landing view, the h1 reads «الحلقات», the eyebrow «أرشيف الحوارات» and the
 * three tabs name kinds; the only place the word خط appears is inside the text
 * of the tab that happens to be selected. So the one lane a visitor lands on by
 * default was the one lane that never named the podcast.
 *
 * It is not filler either: it carries the fact that separates this lane from
 * the two beside it — these are the COMPLETE conversations, not the cut-downs
 * in `clips` and not the other programme in `separate`.
 */
export function laneNote(lane: ProgramLane, categories: EpisodeCategory[]): string | null {
  if (lane === "khat") {
    return "هذي حلقات «بودكاست خط» نفسه — الحوارات الكاملة."
  }
  if (lane === "clips") {
    // NOT «مقاطع قصيرة». Measured over the published archive: these six run
    // 8–24 min (mean 17), and the سالفة episodes one tab away run 5–15 (mean
    // 9) — so the row labelled "short" is on average nearly twice the length
    // of the row that is not. «قصيرة» was a claim about the wrong axis: what
    // makes these different is that they are CUT OUT of something, which is
    // what the rest of the sentence already says.
    //
    // THE CONDITION ON THOSE TWO MEANS, which was applied and not written
    // down: the `smoke-ux3b` fixture row is excluded. It is a test artefact,
    // not a published episode, and its duration drags the سالفة mean. Anyone
    // re-measuring without excluding it will get different numbers and think
    // the comment has rotted, so the exclusion is part of the claim.
    return "مقاطع مقتطعة من حلقات خط — مو حلقات كاملة."
  }
  const own = laneCategories(categories, "separate")
  return own.length === 1
    ? `«${own[0].name}» برنامج مستقل — مو من حلقات بودكاست خط.`
    : "برامج مستقلة — مو من حلقات بودكاست خط."
}

/**
 * What a category page CALLS ITSELF — the <title> and the meta description.
 *
 * IT LIVES HERE BECAUSE THE CLASSIFICATION LIVES HERE. `/categories/[slug]`
 * wrote its own copy, and being the one page in the archive that carries a
 * self-referencing canonical, its version is the one that gets indexed:
 *
 *   <title>          سالفة — خط بودكاست
 *   <description>    كل حلقات بودكاست خط ضمن تصنيف سالفة
 *
 * while the body of that very page renders «سالفة» برنامج مستقل — مو من حلقات
 * بودكاست خط. The page contradicted itself between its head and its body, and
 * the head is the half a search engine repeats. It did the same to the clips,
 * calling six cut-downs «حلقات» one tab away from the sentence that says they
 * are not.
 *
 * The fix is not better strings in that file — it is that the strings ask the
 * same question the page asks. `laneNote` already IS the sentence written for
 * exactly this purpose ("one sentence telling a first-time visitor what they
 * are looking at"), so the description reuses it rather than paraphrasing it,
 * and a future correction to the copy lands in both places at once.
 */
export function categoryMetadata(
  category: EpisodeCategory,
  categories: EpisodeCategory[],
): { title: string; description: string } {
  const lane = laneOfCategorySlug(category.slug)
  const note = laneNote(lane, categories)

  // ── NO SITE NAME IN HERE ──────────────────────────────────────────────
  // `app/layout.tsx` sets `title.template = "%s | بودكاست خط"`, so the brand is
  // appended to every page title already. The old copy spelled it again —
  // `${name} — خط بودكاست` — and what actually rendered was
  //
  //   <title>سالفة — خط بودكاست | بودكاست خط</title>
  //
  // the brand twice in one tab, in the wave that removed exactly that from five
  // other surfaces. It was not in the review notes; it is measurable in any
  // page source. Return the page's OWN name and let the template do its job.
  if (lane === "khat") {
    // A season of خط, so the old description was true here and stays.
    return {
      title: category.name,
      description: `كل حلقات بودكاست خط ضمن «${category.name}».`,
    }
  }

  // The tag is the KIND, and for a separate programme it is the whole point of
  // the title: «سالفة» alone tells a searcher nothing. Clips have no tag (see
  // LANE_TAG) because their own name already says what they are.
  const tag = laneTag(lane)
  return {
    title: tag ? `${category.name} — ${tag}` : category.name,
    description: note ?? `${category.name} على خط بودكاست.`,
  }
}
