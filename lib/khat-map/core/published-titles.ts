/**
 * Titles of episodes already published on the site — the strongest exclusion
 * a topic generator can have: re-proposing an aired episode is wasted work.
 * Read by both topic engines (hybrid + season wizard). Topic-engine defect
 * #18: neither engine read the `episodes` table before 2026-10-03.
 *
 * Both the stored title AND the admin's custom title (episode_overrides) are
 * returned — either is how the episode is known. Each is cleaned for token
 * similarity: the YouTube brand stamp («| 019 بودكاست خط», «.. مقاطع من
 * بودكاست خط») via the site's own display helper, then a trailing
 * «| guest name». Newest first.
 */

import { desc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { episodes, episodeOverrides } from "@/lib/db/schema/episodes"
import { displayEpisodeTitle } from "@/lib/shared/formatters"

/** Display title minus a trailing «| guest name» (the topic is before the bar). */
export function cleanEpisodeTitleForTopicMatch(title: string | null | undefined): string {
  const display = displayEpisodeTitle(title)
  const head = display.split(/\s*\|\s*/)[0]?.trim()
  return head || display
}

export async function loadPublishedEpisodeTitles(limit = 300): Promise<string[]> {
  const rows = await db!
    .select({ title: episodes.title, custom_title: episodeOverrides.custom_title })
    .from(episodes)
    .leftJoin(episodeOverrides, eq(episodeOverrides.episode_id, episodes.id))
    .where(eq(episodes.status, "published"))
    .orderBy(desc(episodes.release_date))
    .limit(limit)
  const out: string[] = []
  const seen = new Set<string>()
  for (const r of rows) {
    for (const t of [r.title, r.custom_title]) {
      const clean = cleanEpisodeTitleForTopicMatch(t)
      if (clean && !seen.has(clean)) {
        seen.add(clean)
        out.push(clean)
      }
    }
  }
  return out
}
