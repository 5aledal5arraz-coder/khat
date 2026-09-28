/**
 * v2 step 2 — enrich a person with independent signals, all in parallel.
 * Runs for EVERY proposed person, resolved or not: an unresolved person is
 * passed as a synthetic `{ resolved: false, label, label_ar }` so the
 * name-based sources still search (X/Instagram need a Wikidata handle and
 * correctly return null). Failures degrade gracefully (null), never throw.
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
import { instagramPresence } from "./sources/instagram"

export async function enrich(
  name: string,
  facts: WikiFacts,
): Promise<EnrichmentSignals> {
  // An UNCERTAIN Wikidata match may be a namesake — never look up its
  // handles or search by its labels (the pipeline already passes the
  // proposal instead; this is the same rule at the source).
  const wiki: WikiFacts =
    facts.resolved && facts.identity_uncertain ? { resolved: false } : facts
  const nameEn = wiki.label ?? name
  const nameAr = wiki.label_ar ?? name
  const [scholar, books, news, youtube, podcast, x, instagram] = await Promise.all([
    openAlex(nameEn).catch(() => null),
    googleBooks(nameEn, nameAr).catch(() => null),
    gdeltNews(name, nameEn).catch(() => null),
    youtubePerson(name, nameEn).catch(() => null),
    podcastAppearances(name, nameEn).catch(() => null),
    xPresence(wiki).catch(() => null),
    instagramPresence(wiki).catch(() => null),
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
      instagram,
      youtube: {
        channel_url: wiki.social.youtube_channel,
        channel_title: yt?.channel_title ?? wiki.label ?? name,
        talk_url: yt?.talk_url ?? null,
        talk_title: yt?.talk_title ?? null,
        talk_description: yt?.talk_description ?? null,
        subscriber_hint: yt?.subscriber_hint ?? null,
      },
    }
  }
  return { scholar, books, news, youtube: yt, podcast, x, instagram }
}
