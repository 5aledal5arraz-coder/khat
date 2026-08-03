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
 *      number to a `season` filter instead — ONE call site,
 *      `app/episodes/page.tsx`, marked there with a pointer back to here.
 * Nothing else in the tree knows how a season is decided.
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
 * The label is adaptive for `separate` on purpose: with exactly one separate
 * program the tab should read «سالفة», because that is the thing; a generic
 * «برامج أخرى» would only make sense once there are several. `khat` and
 * `clips` name a KIND rather than a brand, so they are fixed.
 */
const LANE_LABEL: Record<ProgramLane, string> = {
  khat: "حلقات خط",
  separate: "برامج أخرى",
  clips: "مقاطع من الحلقات",
}

/** Small badge printed on the tab, so the KIND is visible without clicking. */
const LANE_TAG: Record<ProgramLane, string | null> = {
  khat: null,
  separate: "برنامج منفصل",
  clips: "مقتطعة من الحلقات",
}

export function laneLabel(lane: ProgramLane, categories: EpisodeCategory[]): string {
  const own = laneCategories(categories, lane)
  if (lane === "separate" && own.length === 1) return own[0].name
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
 * خط gets none: it is the site, and the page header already says so. Saying
 * something anyway would flatten the distinction this whole module exists to
 * draw.
 */
export function laneNote(lane: ProgramLane, categories: EpisodeCategory[]): string | null {
  if (lane === "khat") return null
  if (lane === "clips") {
    return "مقاطع قصيرة مقتطعة من حلقات خط — مو حلقات كاملة."
  }
  const own = laneCategories(categories, "separate")
  return own.length === 1
    ? `«${own[0].name}» برنامج مستقل — مو من حلقات بودكاست خط.`
    : "برامج مستقلة — مو من حلقات بودكاست خط."
}
