/**
 * The Arabic-podcast corpus sources Khat studies.
 *
 * Config-driven ON PURPOSE: adding a show is a one-line entry here. Each source
 * resolves to a YouTube channel via (in priority order) an explicit channel_id,
 * a @handle, or a search_query. Several of the biggest shows (فنجان، سقراط،
 * سوالف بزنس) share ONE channel (@thmanyahPodcasts / ثمانية); we ingest the whole
 * channel and let Phase B3 tag which show each episode belongs to from its title.
 *
 * `is_khat` marks Khat's own catalogue — kept in the same corpus so Phase B3 can
 * model Khat's lane (what it has covered, its voice) alongside the competitors.
 */

export interface CorpusSource {
  slug: string
  name_ar: string
  /** Explicit YouTube channel id, if known (cheapest + most reliable). */
  channel_id?: string
  /** YouTube @handle (resolved via channels?forHandle — 1 quota unit). */
  handle?: string
  /** Last-resort: resolve by search (channel search costs ~100 quota units). */
  search_query?: string
  /** Khat's own catalogue vs a competitor. */
  is_khat?: boolean
  /** Cap on episodes pulled per run (controls quota + storage). */
  max_episodes?: number
  /** Shows sharing this channel (for Phase B3 per-show tagging by title). */
  shows?: string[]
}

export const CORPUS_SOURCES: CorpusSource[] = [
  {
    slug: "khat",
    name_ar: "خط",
    handle: "@KhatPodcast",
    is_khat: true,
    max_episodes: 200,
  },
  {
    // فنجان + سقراط + سوالف بزنس (and other ثمانية shows) all publish here.
    slug: "thmanyah",
    name_ar: "ثمانية (فنجان، سقراط، سوالف بزنس)",
    handle: "@thmanyahPodcasts",
    max_episodes: 400,
    shows: ["بودكاست فنجان", "بودكاست سقراط", "بودكاست سوالف بزنس"],
  },
  {
    slug: "bidon_waraq",
    name_ar: "بدون ورق",
    handle: "@BidonWaraq",
    channel_id: "UC7mCgzz-LYRt-a3mCvUbccg",
    max_episodes: 300,
  },
  {
    slug: "mahfoof",
    name_ar: "محفوف",
    search_query: "بودكاست محفوف محمد الزايد",
    max_episodes: 300,
  },
  {
    slug: "ghamd",
    name_ar: "غمد",
    search_query: "بودكاست غمد",
    max_episodes: 300,
  },
]

export function getCorpusSource(slug: string): CorpusSource | undefined {
  return CORPUS_SOURCES.find((s) => s.slug === slug)
}
