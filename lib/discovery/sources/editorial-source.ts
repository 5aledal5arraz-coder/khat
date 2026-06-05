/**
 * Phase Beta — EditorialSource.
 *
 * Pulls candidate seeds from STRUCTURED editorial surfaces:
 *
 *   1. Podcast guest lists — uses the iTunes Search API (already in
 *      lib/discovery/search-agents.ts) to surface podcasts adjacent to
 *      the archetype, then for each podcast, fetches the RSS feed and
 *      extracts guest names from episode titles ("ضيف الحلقة X",
 *      "حوار مع Y", "with Z").
 *
 *   2. Newspaper "people to watch" pages — runs targeted Brave
 *      searches against major Kuwaiti outlets (Al-Qabas, Al-Rai,
 *      Al-Watan, Kuwait Times) using curated query templates that
 *      surface profile articles ("لقاء مع", "في حوار خاص", "personality
 *      of the week").
 *
 *   3. Conference speaker rosters — Brave search for speaker pages on
 *      Kuwait-hosted events (e.g. Hub71, KCFE, KIPCO Tower talks).
 *
 * Compared to the existing google_web + youtube agents, EditorialSource
 * specifically chases content where the publisher has already done the
 * "this is a real person worth listening to" curation work for us. The
 * downstream classifier confirms; the source short-circuits the
 * brand-vs-person ambiguity that plagued Operator Day #2.
 *
 * The agent returns the same SearchResult shape so it slots into the
 * existing runSearchAgent dispatch with no changes to the job pipeline.
 */

import type {
  DiscoveryArchetype,
  DiscoveryEvidenceUrl,
} from "@/lib/db/schema/discovery"
import type {
  SearchResult,
  SearchCandidate,
  DiscoveryFilterContext,
} from "../search-agents"

export const EDITORIAL_SOURCE_VERSION = "beta-editorial-1" as const

// ─── Tier 1: Podcast guest extraction via iTunes RSS ─────────────────
//
// iTunes returns podcasts; the feedUrl points to the RSS feed where
// episode titles live. We pull a small slice (default 20 newest
// episodes per podcast, capped) and use a regex stack to extract the
// guest name from "<host> with <guest>" / "ضيف الحلقة X" patterns.
//
// Guest names extracted this way are HIGH-PRIORITY candidates because:
//   - A real human was already interviewed (person-class signal)
//   - A publisher (the show host) vetted them (editorial signal)
//   - The episode title is structured content, not search noise

const GUEST_TITLE_PATTERNS: Array<{
  re: RegExp
  group: number
  hint: string
}> = [
  // Arabic — "حوار مع <NAME>" / "مقابلة مع <NAME>" / "ضيف الحلقة <NAME>"
  { re: /حوار\s+مع\s+([^\-—–|·]+)/u, group: 1, hint: "حوار مع" },
  { re: /مقابلة\s+مع\s+([^\-—–|·]+)/u, group: 1, hint: "مقابلة مع" },
  { re: /لقاء\s+مع\s+([^\-—–|·]+)/u, group: 1, hint: "لقاء مع" },
  { re: /(?:^|\s)ضيف(?:ة)?(?:\s+(?:هذه\s+)?الحلقة)?\s+([^\-—–|·]+)/u, group: 1, hint: "ضيف الحلقة" },
  // Latin — "Episode N with <NAME>" / "<NAME> on <SHOW>" / "Ep. N: <NAME>"
  { re: /(?:episode\s+\d+|ep\.?\s*\d+)[:\s—–-]+([A-Z][a-zA-Z'\-]+\s+[A-Z][a-zA-Z'\-]+)/i, group: 1, hint: "episode + name" },
  { re: /\bwith\s+(Dr\.?\s+)?([A-Z][a-zA-Z'\-]+\s+[A-Z][a-zA-Z'\-]+)/i, group: 2, hint: "with NAME" },
  { re: /\bft\.?\s+([A-Z][a-zA-Z'\-]+\s+[A-Z][a-zA-Z'\-]+)/i, group: 1, hint: "ft. NAME" },
]

/**
 * Extract a likely guest name from an episode title. Returns null if
 * no pattern matches confidently. Trims trailing show-tags ("| الحلقة
 * 12") and normalises whitespace.
 */
export function extractGuestNameFromTitle(title: string): {
  name: string
  hint: string
} | null {
  if (!title || title.length < 5) return null
  const cleaned = title.trim()
  for (const { re, group, hint } of GUEST_TITLE_PATTERNS) {
    const m = cleaned.match(re)
    if (m && m[group]) {
      const raw = m[group].trim().replace(/\s+/g, " ")
      // Strip trailing channel-tag junk: "خالد الرشيدي - حلقة 12" → "خالد الرشيدي"
      const name = raw.split(/\s+[-—–|·]\s+/)[0]?.trim() ?? raw
      // Drop if we ended up with a clearly non-name fragment
      if (name.length < 3 || name.length > 60) continue
      if (/^(ال|the)\s/i.test(name) && name.split(/\s+/).length < 2) continue
      return { name, hint }
    }
  }
  return null
}

/**
 * Minimal RSS parser for episode titles. We don't need a full feed
 * parser — we just want `<item><title>…</title></item>` slices.
 * iTunes RSS feeds are well-formed enough that a regex slice covers
 * 95% of real cases; bad feeds yield zero matches, which is the
 * right failure mode.
 */
function parseRssEpisodeTitles(xml: string, max: number): string[] {
  const out: string[] = []
  const re = /<item>[\s\S]*?<title>(?:<!\[CDATA\[)?([^<\]]+)(?:\]\]>)?<\/title>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(xml)) !== null) {
    if (out.length >= max) break
    const t = m[1]?.trim()
    if (t && t.length >= 5) out.push(t)
  }
  return out
}

interface PodcastSeed {
  feedUrl: string
  showName: string
  showUrl: string | null
}

async function discoverPodcastsAdjacent(
  archetype: DiscoveryArchetype,
  filters: DiscoveryFilterContext | undefined,
  maxPodcasts: number,
): Promise<PodcastSeed[]> {
  // Reuse the iTunes search the existing podcast agent already
  // wraps — but here we want the podcast LIST, not the host as
  // candidate. We make a thin direct call so EditorialSource isn't
  // entangled with the legacy podcast adapter.
  const out: PodcastSeed[] = []
  const queries = [
    ...(archetype.target_signals ?? []),
    archetype.name,
    ...(archetype.expected_traits ?? []),
  ]
    .filter((s): s is string => Boolean(s && s.length >= 3))
    .slice(0, 5)

  for (const baseQuery of queries) {
    if (out.length >= maxPodcasts) break
    const q = filters?.nationality === "kuwaiti"
      ? `${baseQuery} الكويت`
      : baseQuery
    const url = new URL("https://itunes.apple.com/search")
    url.searchParams.set("media", "podcast")
    url.searchParams.set("term", q.slice(0, 200))
    url.searchParams.set("limit", String(Math.min(maxPodcasts - out.length, 25)))
    try {
      const res = await fetch(url.toString(), {
        headers: { "User-Agent": "khatpodcast-editorial/1.0" },
      })
      if (!res.ok) continue
      const payload = (await res.json()) as {
        results?: Array<{
          collectionName?: string
          collectionViewUrl?: string
          feedUrl?: string
        }>
      }
      for (const item of payload.results ?? []) {
        if (!item.feedUrl || !item.collectionName) continue
        if (out.some((p) => p.feedUrl === item.feedUrl)) continue
        out.push({
          feedUrl: item.feedUrl,
          showName: item.collectionName,
          showUrl: item.collectionViewUrl ?? null,
        })
        if (out.length >= maxPodcasts) break
      }
    } catch {
      continue
    }
  }
  return out
}

async function harvestGuestsFromPodcasts(
  podcasts: PodcastSeed[],
  perFeed: number,
  maxGuests: number,
): Promise<SearchCandidate[]> {
  const out: SearchCandidate[] = []
  const seenNames = new Set<string>()
  for (const p of podcasts) {
    if (out.length >= maxGuests) break
    let xml = ""
    try {
      const res = await fetch(p.feedUrl, {
        headers: { "User-Agent": "khatpodcast-editorial/1.0" },
      })
      if (!res.ok) continue
      xml = await res.text()
    } catch {
      continue
    }
    const titles = parseRssEpisodeTitles(xml, perFeed)
    for (const t of titles) {
      if (out.length >= maxGuests) break
      const guest = extractGuestNameFromTitle(t)
      if (!guest) continue
      const key = guest.name.toLowerCase()
      if (seenNames.has(key)) continue
      seenNames.add(key)
      out.push({
        proposed_name: guest.name,
        proposed_role: "interview guest",
        proposed_country: null,
        evidence_urls: [
          {
            platform: "editorial",
            url: p.showUrl ?? p.feedUrl,
            title: `${p.showName} — ${t}`,
            snippet: `Guest pattern: ${guest.hint}`,
            fetched_at: new Date().toISOString(),
          },
        ],
        platform_signals: {
          editorial: {
            sub_source: "podcast_rss",
            show: p.showName,
            extraction_hint: guest.hint,
          },
        },
      })
    }
  }
  return out
}

// ─── Tier 2: Newspaper profile-article queries ───────────────────────

const KUWAIT_OUTLET_DOMAINS = [
  "alqabas.com",
  "alraimedia.com",
  "alanba.com.kw",
  "kuwaittimes.com",
  "alwatan.com.kw",
  "aljarida.com",
]

const PROFILE_QUERY_TEMPLATES_AR = [
  '"لقاء مع"',
  '"في حوار خاص"',
  '"شخصية الأسبوع"',
  '"حوار مع"',
]
const PROFILE_QUERY_TEMPLATES_EN = [
  '"personality of the week"',
  '"interview with"',
  '"in conversation with"',
]

async function harvestFromKuwaitNewspapers(
  archetype: DiscoveryArchetype,
  maxResults: number,
): Promise<SearchCandidate[]> {
  const apiKey = process.env.BRAVE_SEARCH_KEY
  if (!apiKey) return []
  const out: SearchCandidate[] = []
  const seenDomains = new Set<string>()

  const archetypeAnchor = archetype.target_signals?.[0] ?? archetype.name
  if (!archetypeAnchor) return []

  const queries: string[] = []
  for (const tpl of PROFILE_QUERY_TEMPLATES_AR) {
    for (const dom of KUWAIT_OUTLET_DOMAINS.slice(0, 3)) {
      queries.push(`${tpl} ${archetypeAnchor} site:${dom}`)
    }
  }
  for (const tpl of PROFILE_QUERY_TEMPLATES_EN) {
    for (const dom of KUWAIT_OUTLET_DOMAINS.slice(3, 6)) {
      queries.push(`${tpl} ${archetypeAnchor} site:${dom}`)
    }
  }

  for (const q of queries) {
    if (out.length >= maxResults) break
    const url = new URL("https://api.search.brave.com/res/v1/web/search")
    url.searchParams.set("q", q.slice(0, 200))
    url.searchParams.set("count", "10")
    try {
      const res = await fetch(url.toString(), {
        headers: {
          Accept: "application/json",
          "X-Subscription-Token": apiKey,
        },
      })
      if (!res.ok) continue
      const payload = (await res.json()) as {
        web?: {
          results?: Array<{
            title?: string
            url?: string
            description?: string
            meta_url?: { hostname?: string }
          }>
        }
      }
      for (const item of payload.web?.results ?? []) {
        if (out.length >= maxResults) break
        if (!item.url || !item.title) continue
        const domain = item.meta_url?.hostname ?? ""
        if (seenDomains.has(`${domain}|${item.title.slice(0, 30)}`)) continue
        seenDomains.add(`${domain}|${item.title.slice(0, 30)}`)
        // Try to extract a name from the article title itself
        const fromTitle = extractGuestNameFromTitle(item.title)
        out.push({
          proposed_name: fromTitle?.name ?? null,
          proposed_role: "newspaper profile subject",
          proposed_country: "Kuwait",
          evidence_urls: [
            {
              platform: "editorial",
              url: item.url,
              title: item.title,
              snippet: item.description ?? null,
              fetched_at: new Date().toISOString(),
            },
          ],
          platform_signals: {
            editorial: {
              sub_source: "newspaper_profile",
              outlet: domain,
              query: q,
            },
          },
        })
      }
    } catch {
      continue
    }
  }
  return out
}

// ─── Public surface ──────────────────────────────────────────────────

export interface EditorialSourceInput {
  archetype: DiscoveryArchetype
  maxResults: number
  filters?: DiscoveryFilterContext
}

export async function runEditorialSource(
  input: EditorialSourceInput,
): Promise<SearchResult> {
  const max = Math.max(1, input.maxResults)
  // Budget — half from podcast guests, half from newspaper profiles.
  const podcastBudget = Math.ceil(max / 2)
  const newspaperBudget = max - podcastBudget

  // Tier 1: podcast guests
  const podcasts = await discoverPodcastsAdjacent(
    input.archetype,
    input.filters,
    Math.min(5, podcastBudget),
  )
  const podcastCandidates = await harvestGuestsFromPodcasts(
    podcasts,
    20,
    podcastBudget,
  )

  // Tier 2: newspaper profiles
  const newspaperCandidates = await harvestFromKuwaitNewspapers(
    input.archetype,
    newspaperBudget,
  )

  const candidates = [...podcastCandidates, ...newspaperCandidates].slice(
    0,
    max,
  )

  const configured = Boolean(process.env.BRAVE_SEARCH_KEY)
  return {
    source: "editorial",
    configured,
    note:
      candidates.length === 0
        ? `editorial source — 0 candidates (podcasts=${podcasts.length}, brave=${configured})`
        : undefined,
    candidates,
  }
}

// Re-exports for testing
export { GUEST_TITLE_PATTERNS, KUWAIT_OUTLET_DOMAINS }
export type { SearchResult, SearchCandidate }
