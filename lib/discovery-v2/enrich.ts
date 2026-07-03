/**
 * v2 step 2 — enrich a Wikidata-resolved person with independent signals,
 * all in parallel. Failures degrade gracefully (null), never throw.
 */

import type { EnrichmentSignals, WikiFacts } from "./types"
import {
  openAlex,
  googleBooks,
  gdeltNews,
  youtubePerson,
  podcastAppearances,
} from "./sources/enrich-sources"
import { xPresence } from "./sources/x"

export async function enrich(
  name: string,
  wiki: WikiFacts,
): Promise<EnrichmentSignals> {
  const nameEn = wiki.label ?? name
  const nameAr = wiki.label_ar ?? name
  const [scholar, books, news, youtube, podcast, x] = await Promise.all([
    openAlex(nameEn).catch(() => null),
    googleBooks(nameEn, nameAr).catch(() => null),
    gdeltNews(name, nameEn).catch(() => null),
    youtubePerson(name, nameEn).catch(() => null),
    podcastAppearances(name, nameEn).catch(() => null),
    xPresence(wiki).catch(() => null),
  ])
  // Prefer Wikidata's own YouTube channel link if present.
  const yt = youtube ?? null
  if (wiki.social?.youtube_channel) {
    return {
      scholar,
      books,
      news,
      podcast,
      x,
      youtube: {
        channel_url: wiki.social.youtube_channel,
        channel_title: yt?.channel_title ?? wiki.label ?? name,
        talk_url: yt?.talk_url ?? null,
        subscriber_hint: yt?.subscriber_hint ?? null,
      },
    }
  }
  return { scholar, books, news, youtube: yt, podcast, x }
}
