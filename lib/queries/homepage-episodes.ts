/**
 * «قاعة الحلقات» — what the homepage episode grid shows, and what it is called.
 *
 * The admin tab has offered an auto/manual switch since it was built and the
 * homepage never read it: the grid was hardcoded to `conversations.slice(1,7)`.
 * This is the resolver that finally connects them, and it widens "auto" from
 * one behaviour into a chosen FILTER.
 *
 * Everything is decided from the SAME merged episode list the rest of the page
 * uses (`getEpisodes({withCategories:true})`), never from a fresh table read.
 * That list is where tombstones, overrides and the YouTube merge have already
 * been applied — querying `episodes` directly would quietly disagree with the
 * cards rendered right above it.
 *
 * Storage is two rows in `homepage_settings`, a key/value table:
 *   featured_mode   = auto | manual
 *   featured_filter = newest | most_viewed | program:<slug> | topic:<slug>
 * so none of this needed a migration.
 */

import type { Episode } from "@/types/database"
import { getEpisodes } from "./episodes"
import { filterLane } from "@/lib/episodes/programs"
import { getHomepageMode, getHomepageSetting } from "./homepage-settings"
import { getHomepageFeatured } from "./homepage-featured"
import { episodeIdsForTopicSlug, listTopics } from "./topics"
import { HOMEPAGE_FILTER_KEY, HOMEPAGE_EPISODE_CAP, parseHomepageFilter } from "@/lib/homepage/hall"

// Re-exported so existing server-side importers keep working. Client code must
// import from `@/lib/homepage/hall` directly — see the note in that file.
export { HOMEPAGE_FILTER_KEY, MANUAL_SLOTS, HOMEPAGE_EPISODE_CAP, GUEST_FIRST_SLOT, GUEST_STEP, parseHomepageFilter, serializeHomepageFilter } from "@/lib/homepage/hall"
export type { HomepageEpisodeFilter } from "@/lib/homepage/hall"

export interface HomepageEpisodeSelection {
  /** The episodes to render, already ordered and capped. */
  episodes: Episode[]
  /** How many matched BEFORE the cap — so «كل الحلقات» can say what it hides. */
  total: number
  /** Where «الكل» goes: the topic's own page when a topic is selected. */
  moreHref: string
  /** The section heading — it follows the filter, so the page never says «أحدث الحلقات» over a list of invasion episodes. */
  label: string
  mode: "auto" | "manual"
}

const DEFAULT_LABEL = "أحدث الحلقات"

/**
 * Resolve the grid.
 *
 * `exclude` is the hero episode: the page prints it full-width directly above,
 * and a grid that repeats it looks like a bug. Passing the id here rather than
 * slicing afterwards keeps a filtered list at its full length — slicing off the
 * first card would silently drop one invasion episode from «كل حلقات الغزو».
 */
export async function getHomepageEpisodeSelection(
  opts: { exclude?: string | null; episodes?: Episode[] } = {},
): Promise<HomepageEpisodeSelection> {
  const excludeId = opts.exclude ?? null
  const drop = (list: Episode[]) => (excludeId ? list.filter((e) => e.id !== excludeId) : list)

  // The caller usually already holds this list (the homepage fetched it to pick
  // its hero). Reuse it rather than fetching the same thing twice per render.
  let all: Episode[] = opts.episodes ?? []
  if (!opts.episodes) {
    try {
      all = await getEpisodes({ withCategories: true })
    } catch {
      return { episodes: [], total: 0, label: DEFAULT_LABEL, mode: "auto", moreHref: "/episodes" }
    }
  }

  const mode = await getHomepageMode("featured").catch(() => "auto" as const)

  // ── Manual: exactly what the operator picked, in their order ──────────────
  if (mode === "manual") {
    const picked = await getHomepageFeatured().catch(() => [])
    if (picked.length > 0) {
      const byId = new Map(all.map((e) => [e.id, e]))
      const chosen = picked
        .map((p) => byId.get(p.episode_id))
        .filter((e): e is Episode => Boolean(e))
      if (chosen.length > 0) {
        return finish(drop(chosen), "حلقات مختارة", "manual", "/episodes")
      }
    }
    // Picked nothing, or picked only episodes that no longer exist. Falling
    // through to the auto list beats printing an empty homepage.
  }

  // ── Auto: the chosen filter ───────────────────────────────────────────────
  const filter = parseHomepageFilter(await getHomepageSetting(HOMEPAGE_FILTER_KEY).catch(() => null))

  if (filter.kind === "program") {
    const inProgram = all.filter((e) => e.category?.slug === filter.slug)
    const label = inProgram[0]?.category?.name || DEFAULT_LABEL
    return finish(drop(byDateDesc(inProgram)), label, "auto", "/episodes")
  }

  if (filter.kind === "topic") {
    const ids = new Set(await episodeIdsForTopicSlug(filter.slug).catch(() => [] as string[]))
    const tagged = all.filter((e) => ids.has(e.id))
    const topic = (await listTopics().catch(() => [])).find((t) => t.slug === filter.slug)
    // An empty result here is a real state — a topic that exists but has no
    // episodes tagged yet — so it must not silently fall back to «الأحدث»,
    // which would look like the filter was ignored.
    // «الكل» points at the topic's own page, not the full archive — it is the
    // only link that actually shows the rest of what the filter matched.
    return finish(drop(byDateDesc(tagged)), topic?.name || DEFAULT_LABEL, "auto",
      `/topics/${encodeURIComponent(filter.slug)}`)
  }

  if (filter.kind === "most_viewed") {
    const ranked = [...filterLane(all, "khat")].sort(
      (a, b) => (b.view_count ?? 0) - (a.view_count ?? 0),
    )
    return finish(drop(ranked), "الأكثر مشاهدة", "auto", "/episodes")
  }

  return finish(drop(byDateDesc(filterLane(all, "khat"))), DEFAULT_LABEL, "auto", "/episodes")
}

/** Apply the cap and record what it hid. */
function finish(
  list: Episode[],
  label: string,
  mode: "auto" | "manual",
  moreHref: string,
): HomepageEpisodeSelection {
  return { episodes: list.slice(0, HOMEPAGE_EPISODE_CAP), total: list.length, label, mode, moreHref }
}

function byDateDesc(list: Episode[]): Episode[] {
  return [...list].sort(
    (a, b) => new Date(b.release_date).getTime() - new Date(a.release_date).getTime(),
  )
}
