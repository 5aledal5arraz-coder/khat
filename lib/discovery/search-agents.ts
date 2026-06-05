/**
 * Khat Brain Phase 5 — Discovery search agents.
 *
 * One adapter per platform. Each adapter receives an archetype + run
 * id, queries the platform, and returns 0..N evidence URLs. Agents are
 * deliberately conservative:
 *   - No scraping that violates ToS
 *   - Use official APIs where available
 *   - When a platform isn't configured, return a clear `not_configured`
 *     marker so the caller can record the gap in candidates' platform_signals
 *
 * Phase 5 ships:
 *   - YouTube (uses lib/youtube/client.ts; needs YOUTUBE_API_KEY)
 *   - Google web search (placeholder — uses CSE API if configured;
 *     otherwise returns not_configured)
 *   - X / Instagram / TikTok / Podcast directory: stubs that return
 *     not_configured with a clear note. Wire real adapters in Phase 6+.
 */

import type { DiscoveryArchetype, DiscoveryEvidenceUrl } from "./types"

export type DiscoverySource =
  | "youtube"
  | "x"
  | "instagram"
  | "tiktok"
  | "podcast"
  | "google_web"
  // ─── Phase Beta sources ─────────────────────────────────────────
  | "editorial"
  | "public_voice"
  | "network"
  // ─── LLM-knowledge source — proposes real named people directly,
  //     no external search API needed (see sources/ai-knowledge-source).
  | "ai_knowledge"

export interface SearchResult {
  source: DiscoverySource
  configured: boolean
  /** Reason the agent returned no/limited results. */
  note?: string
  /** Synthetic candidate proposals. Each maps to one row downstream. */
  candidates: SearchCandidate[]
}

export interface SearchCandidate {
  proposed_name?: string | null
  proposed_role?: string | null
  proposed_country?: string | null
  evidence_urls: DiscoveryEvidenceUrl[]
  /** Optional raw signals (subscriber counts, etc.) — copied to candidate. */
  platform_signals?: Record<string, unknown>
}

// ─── Helpers ─────────────────────────────────────────────────────────

/**
 * Phase B redesign — strict guest filters propagated from the season's
 * editorial controls. The query builder and verifier read these so the
 * candidate set actually respects gender + nationality (rather than
 * relying on the LLM to honor them).
 */
export interface DiscoveryFilterContext {
  gender?: "male" | "female"
  nationality?: "kuwaiti" | "non_kuwaiti"
  /** Anchored episode title — appended to queries for topic-bound search. */
  episodeWorkingTitle?: string | null
  /** Topic domain label — used as a recall booster. */
  episodeTopicDomain?: string | null
}

/**
 * Phase B redesign — append nationality and topic context to each
 * generated query so YouTube / web search returns more focused results.
 * Gender is intentionally NOT injected (most platforms don't index
 * gender as a query parameter — relying on it would just narrow recall
 * with no precision benefit). Gender is enforced post-search in the
 * verifier instead.
 */
function applyFilterModifiers(
  query: string,
  filters: DiscoveryFilterContext | undefined,
): string {
  if (!filters) return query
  const bits: string[] = [query]
  if (filters.nationality === "kuwaiti") bits.push("الكويت OR Kuwait")
  // We don't add a NOT-Kuwait clause for non_kuwaiti — Google/Brave
  // boolean exclusion is unreliable. The verifier drops Kuwaiti hits
  // for non_kuwaiti runs.
  if (filters.episodeWorkingTitle && filters.episodeWorkingTitle.length >= 4) {
    bits.push(filters.episodeWorkingTitle)
  }
  return bits.join(" ").slice(0, 200)
}

/**
 * Phase B accuracy — channel/show titles that are clearly NOT a human
 * name. We bias toward `null` (let the verifier extract the person)
 * rather than accept a brand as `proposed_name`. False negatives are
 * cheap (verifier still gets the raw title in evidence_urls);
 * false positives pollute the candidate list with non-people.
 *
 * Heuristics, in order:
 *   • Trim "Show / Podcast / Channel / TV / Network / Ministries /
 *     Institute / Foundation / Media / Productions" tail tokens.
 *   • Reject if the leftover contains more than 3 capitalised tokens
 *     (typical channel-brand pattern: "Daily Christian Devotions").
 *   • Reject if the leftover contains zero whitespace AND is purely
 *     alphanumeric (handles like "FeelGoodKenny").
 *   • Reject if the leftover starts with "The " — almost always a brand.
 *   • Reject if it's only digits / symbols.
 */
function sanitizeProposedHumanName(raw: string | null | undefined): string | null {
  if (!raw) return null
  let name = raw.trim()
  if (!name) return null

  // Strip common brand-tail tokens (case-insensitive).
  name = name.replace(
    /\s+(show|podcast|channel|tv|network|ministries?|institute|foundation|media|productions?|official|live|club|hub|studio|talks?)$/i,
    "",
  ).trim()
  if (!name) return null

  // "The ..." → brand
  if (/^the\s/i.test(name)) return null
  // Pure handle (no spaces, alphanumeric) → almost never a real name
  if (!/\s/.test(name) && /^[A-Za-z0-9_]+$/.test(name)) return null
  // Digits / symbols only
  if (!/[A-Za-z\u0600-\u06FF]/.test(name)) return null
  // Heuristic: 4+ tokens is typically a brand sentence
  const tokens = name.split(/\s+/).filter(Boolean)
  if (tokens.length >= 4) return null

  return name
}

/**
 * UX-11.1 — Build an ordered list of search queries from an archetype.
 * Each source tries them in order until it has enough hits. Prior to
 * this we'd use only `archetype.target_signals[0]` which is often a
 * 3-word niche phrase that Google/YouTube doesn't match. Iterating
 * widens recall without losing editorial focus.
 *
 * Phase B redesign — accepts an optional `filters` block. Nationality
 * + episode topic become query modifiers so per-episode runs surface
 * more focused candidates.
 */
function buildQueriesFromArchetype(
  archetype: DiscoveryArchetype,
  filters?: DiscoveryFilterContext,
): string[] {
  const out: string[] = []
  for (const sig of archetype.target_signals ?? []) {
    if (sig && sig.length >= 3) out.push(sig)
  }
  if (archetype.name) out.push(archetype.name)
  for (const trait of archetype.expected_traits ?? []) {
    if (trait && trait.length >= 4) out.push(trait)
  }
  if (archetype.id) out.push(archetype.id.replace(/_/g, " "))
  // De-dupe while preserving order, then apply filter modifiers.
  return [...new Set(out)]
    .map((q) => applyFilterModifiers(q, filters))
    .map((q) => q.slice(0, 200))
}

/**
 * UX-11.1 — Read a Google API error response body and pluck the
 * machine-readable reason (e.g. API_KEY_HTTP_REFERRER_BLOCKED) plus
 * the human message. Operators see this in the run's error_message,
 * which turns "0 candidates" into actionable diagnostics.
 */
async function extractGoogleErrorReason(res: Response): Promise<string | null> {
  try {
    const text = await res.text()
    if (!text) return null
    const json = JSON.parse(text) as {
      error?: {
        message?: string
        errors?: Array<{ reason?: string; message?: string }>
        details?: Array<{ reason?: string }>
      }
    }
    const reason =
      json.error?.errors?.[0]?.reason ??
      json.error?.details?.find((d) => d.reason)?.reason ??
      null
    const message = json.error?.message ?? null
    if (reason && message) return `${reason} — ${message}`
    return reason ?? message ?? null
  } catch {
    return null
  }
}

// RWA-B3 — extract guest-shaped person names from YouTube title +
// description text. The intent is to catch the real interviewee when
// the channelTitle is just the podcast's name.
//
// Patterns we match (in order of confidence):
//   "ضيف هذه الحلقة <NAME>"       → guest of this episode
//   "ضيف الحلقة <NAME>"
//   "حوار مع <NAME>"               → conversation with
//   "مقابلة مع <NAME>"             → interview with
//   "في حوار مع <NAME>"
//   "مع <NAME>"                    → "with NAME" — weak; requires
//                                    NAME to look like a real name
//                                    (2 tokens, capitalized in Latin,
//                                    or starting with a known
//                                    Arabic given name)
//   English: "with <FirstName LastName>", "ft <FirstName LastName>",
//            "feat. <FirstName LastName>", "interview with <NAME>"
//
// We strip trailing show tags ("- بودكاست X", "| الحلقة 12") and
// trim to reasonable length. Returns up to 3 names per text.
function extractGuestNamesFromYoutubeText(text: string): string[] {
  if (!text || text.length < 5) return []
  const candidates: string[] = []

  const arabicPatterns: RegExp[] = [
    /ضيف(?:ة)?\s+(?:هذه\s+)?الحلقة\s+([^\-—–|·,،]{3,40})/u,
    /حوار\s+مع\s+([^\-—–|·,،]{3,40})/u,
    /مقابلة\s+مع\s+([^\-—–|·,،]{3,40})/u,
    /في\s+حوار\s+مع\s+([^\-—–|·,،]{3,40})/u,
    /لقاء\s+مع\s+([^\-—–|·,،]{3,40})/u,
    /(?:^|[\s.،؛])مع\s+(?:الدبلوماسي|الكاتب|الباحث|الفنان|الدكتور|الأستاذ|الفقيه|الإعلامي|الصحفي)\s+([^\-—–|·,،]{3,40})/u,
  ]
  const latinPatterns: RegExp[] = [
    /\bwith\s+(?:Dr\.?\s+)?([A-Z][a-zA-Z'\-]{1,20}\s+[A-Z][a-zA-Z'\-]{1,25})\b/,
    /\bft\.?\s+([A-Z][a-zA-Z'\-]{1,20}\s+[A-Z][a-zA-Z'\-]{1,25})\b/,
    /\bfeat\.?\s+([A-Z][a-zA-Z'\-]{1,20}\s+[A-Z][a-zA-Z'\-]{1,25})\b/,
    /\binterview\s+with\s+([A-Z][a-zA-Z'\-]{1,20}\s+[A-Z][a-zA-Z'\-]{1,25})\b/i,
  ]

  // RWA-B4 — stoplist of common Arabic noun phrases that have the
  // shape of names but aren't. These leak through 2-token matchers.
  const STOPLIST = new Set<string>([
    "هذا الفيديو", "هذه الحلقة", "هذا البرنامج", "المتحدث باسم",
    "الرسمي باسم", "الصالح المتحدث", "الضرر الذي", "الفيديو الذي",
    "اللذي بكى", "وزير الإعلام", "وزير الخارجية", "وزارة الإعلام",
    "ضيف الحلقة", "ضيفة الحلقة", "ضيوف الحلقة",
    "in the", "of the", "for the", "to the", "with the",
    "as the", "and the",
  ])

  function isLikelyHumanName(raw: string): boolean {
    const name = raw.trim().replace(/\s+/g, " ")
    if (name.length < 3 || name.length > 50) return false
    if (STOPLIST.has(name)) return false
    if (STOPLIST.has(name.toLowerCase())) return false
    // Reject if first token is a function word in either language.
    const first = name.split(/\s+/)[0]
    if (/^(ال|the|of|in|for|to|as|and)$/i.test(first)) return false
    // Reject if the entire name is a single function-word-ish token
    if (/^(هذا|هذه|الذي|التي|اللذي|اللتي)\b/u.test(name)) return false
    // Reject mixed Latin+Arabic in same token (channel handle leakage)
    if (/[A-Za-z][؀-ۿ]|[؀-ۿ][A-Za-z]/.test(name)) return false
    return true
  }

  for (const pat of arabicPatterns) {
    if (candidates.length >= 3) break
    const m = text.match(pat)
    if (m && m[1]) {
      const cleaned = m[1].trim().replace(/\s+/g, " ").split(/\s+[-—–|·]\s+/)[0]?.trim()
      if (cleaned && isLikelyHumanName(cleaned)) {
        if (!candidates.some((c) => c.toLowerCase() === cleaned.toLowerCase())) {
          candidates.push(cleaned)
        }
      }
    }
  }
  for (const pat of latinPatterns) {
    if (candidates.length >= 3) break
    const m = text.match(pat)
    if (m && m[1]) {
      const cleaned = m[1].trim()
      if (isLikelyHumanName(cleaned)) {
        if (!candidates.some((c) => c.toLowerCase() === cleaned.toLowerCase())) {
          candidates.push(cleaned)
        }
      }
    }
  }
  return candidates
}

// ─── YouTube adapter ─────────────────────────────────────────────────

async function searchYoutube(
  archetype: DiscoveryArchetype,
  maxResults: number,
  filters?: DiscoveryFilterContext,
): Promise<SearchResult> {
  if (!process.env.YOUTUBE_API_KEY) {
    return {
      source: "youtube",
      configured: false,
      note: "YOUTUBE_API_KEY not set",
      candidates: [],
    }
  }

  // UX-11.1 — try multiple query strategies per archetype. Single-
  // signal queries were too narrow (8 archetypes × 1 query = many
  // searches returning zero hits for niche Arabic terms). We iterate
  // signals + archetype name and stop as soon as we get enough hits.
  const queries = buildQueriesFromArchetype(archetype, filters)

  let lastErrorNote: string | null = null
  const seenChannels = new Set<string>()
  const candidates: SearchCandidate[] = []
  for (const query of queries) {
    if (candidates.length >= maxResults) break
    const url = new URL("https://www.googleapis.com/youtube/v3/search")
    url.searchParams.set("part", "snippet")
    url.searchParams.set("q", query)
    url.searchParams.set("type", "video")
    url.searchParams.set("maxResults", String(Math.min(maxResults, 25)))

    let payload: {
      items?: Array<{
        id: { videoId: string }
        snippet: {
          title: string
          channelId: string
          channelTitle: string
          description: string
        }
      }>
    } = {}

    try {
      const res = await fetch(url.toString(), {
        headers: { "X-goog-api-key": process.env.YOUTUBE_API_KEY },
      })
      if (!res.ok) {
        // Capture the Google error reason — invaluable when the key
        // is referrer-restricted or the API isn't enabled. Without
        // this, operators see "YouTube API 403" and have no idea why.
        const reason = await extractGoogleErrorReason(res)
        lastErrorNote = `YouTube API ${res.status}${reason ? `: ${reason}` : ""}`
        continue
      }
      payload = (await res.json()) as typeof payload
    } catch (err) {
      lastErrorNote = err instanceof Error ? err.message : "fetch failed"
      continue
    }

    for (const item of payload.items ?? []) {
      if (seenChannels.has(item.snippet.channelId)) continue
      seenChannels.add(item.snippet.channelId)
      // Phase B accuracy fix — channel titles are often brands
      // ("Daily Christian", "Yaqeen Institute"), not human names.
      // Setting `proposed_name = null` for brand-shaped titles forces
      // the verifier to extract the actual person from the channel
      // description / video evidence. The raw title still rides along
      // as evidence so the verifier has a starting point.
      const cleaned = sanitizeProposedHumanName(item.snippet.channelTitle)
      candidates.push({
        proposed_name: cleaned,
        proposed_role: null,
        proposed_country: null,
        evidence_urls: [
          {
            platform: "youtube",
            url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
            title: item.snippet.title,
            snippet: item.snippet.description?.slice(0, 280) ?? null,
            fetched_at: new Date().toISOString(),
          },
          {
            platform: "youtube",
            url: `https://www.youtube.com/channel/${item.snippet.channelId}`,
            title: item.snippet.channelTitle,
            fetched_at: new Date().toISOString(),
          },
        ],
        platform_signals: {
          youtube: {
            channel_id: item.snippet.channelId,
            raw_channel_title: item.snippet.channelTitle,
          },
        },
      })

      // RWA-B3 — snippet-extracted GUEST candidates.
      // The channel-title candidate above represents the SHOW. The
      // actual interview GUEST is often named in the title or
      // description ("مع روبرت مالي", "حوار مع X", "ضيف الحلقة Y").
      // Mine those out and emit them as ADDITIONAL candidates pointed
      // at the SAME video URL. Alpha's classifier then triangulates
      // identity from cross-source evidence.
      const haystack = `${item.snippet.title} ${item.snippet.description ?? ""}`
      const guestNames = extractGuestNamesFromYoutubeText(haystack)
      for (const guestName of guestNames) {
        if (candidates.length >= maxResults) break
        if (
          candidates.some(
            (c) => (c.proposed_name ?? "").toLowerCase() === guestName.toLowerCase(),
          )
        ) {
          continue
        }
        candidates.push({
          proposed_name: guestName,
          proposed_role: "interview guest",
          proposed_country: null,
          evidence_urls: [
            {
              platform: "youtube",
              url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
              title: item.snippet.title,
              snippet: item.snippet.description?.slice(0, 280) ?? null,
              fetched_at: new Date().toISOString(),
            },
          ],
          platform_signals: {
            youtube: {
              channel_id: item.snippet.channelId,
              raw_channel_title: item.snippet.channelTitle,
              extracted_from: "snippet",
            },
          },
        })
      }

      if (candidates.length >= maxResults) break
    }
  }

  return {
    source: "youtube",
    configured: true,
    candidates,
    note: candidates.length === 0 ? (lastErrorNote ?? undefined) : undefined,
  }
}

// ─── Web search (Brave default, Google CSE rollback) ─────────────────
//
// Source string stays "google_web" for DB/source_config/evidence
// compatibility. The active provider is chosen by WEB_SEARCH_PROVIDER:
//   unset / anything else → Brave Search (BRAVE_SEARCH_KEY)
//   "google_cse"          → legacy Google CSE (GOOGLE_CSE_KEY + GOOGLE_CSE_CX)
// We deliberately do NOT scrape — only official APIs.

function activeWebSearchProvider(): "brave" | "google_cse" {
  return process.env.WEB_SEARCH_PROVIDER === "google_cse" ? "google_cse" : "brave"
}

/**
 * Phase B redesign — web-search seam. `searchGoogleWeb` is the public
 * facade; the concrete backend (Brave by default, Google CSE via
 * `WEB_SEARCH_PROVIDER=google_cse`) is chosen at runtime. To add a
 * new provider (e.g. Google Programmable Search):
 *   1. Implement an async `(archetype, maxResults, filters?) =>
 *      SearchResult` function with the same shape.
 *   2. Add it to the switch in `activeWebSearchProvider`.
 *   3. Document the env var that opts into it.
 * Nothing else in the discovery pipeline needs to change.
 */
async function searchGoogleWeb(
  archetype: DiscoveryArchetype,
  maxResults: number,
  filters?: DiscoveryFilterContext,
): Promise<SearchResult> {
  if (activeWebSearchProvider() === "google_cse") {
    return searchGoogleCseLegacy(archetype, maxResults, filters)
  }
  return searchBraveWeb(archetype, maxResults, filters)
}

async function searchBraveWeb(
  archetype: DiscoveryArchetype,
  maxResults: number,
  filters?: DiscoveryFilterContext,
): Promise<SearchResult> {
  const apiKey = process.env.BRAVE_SEARCH_KEY
  if (!apiKey) {
    return {
      source: "google_web",
      configured: false,
      note: "BRAVE_SEARCH_KEY not set",
      candidates: [],
    }
  }

  const queries = buildQueriesFromArchetype(archetype, filters)
  let lastErrorNote: string | null = null
  const seenDomains = new Set<string>()
  const candidates: SearchCandidate[] = []

  for (const query of queries) {
    if (candidates.length >= maxResults) break
    const url = new URL("https://api.search.brave.com/res/v1/web/search")
    url.searchParams.set("q", query)
    url.searchParams.set("count", String(Math.min(maxResults, 20))) // Brave caps at 20/req

    let payload: {
      web?: {
        results?: Array<{
          title?: string
          url?: string
          description?: string
          meta_url?: { hostname?: string }
        }>
      }
    } = {}

    try {
      const res = await fetch(url.toString(), {
        headers: {
          Accept: "application/json",
          "X-Subscription-Token": apiKey,
        },
      })
      if (!res.ok) {
        const reason = await extractBraveErrorReason(res)
        lastErrorNote = `Brave Search ${res.status}${reason ? `: ${reason}` : ""}`
        continue
      }
      payload = (await res.json()) as typeof payload
    } catch (err) {
      lastErrorNote = err instanceof Error ? err.message : "fetch failed"
      continue
    }

    for (const item of payload.web?.results ?? []) {
      if (!item.url) continue
      const domain = item.meta_url?.hostname ?? safeHost(item.url)
      if (domain && seenDomains.has(domain)) continue
      if (domain) seenDomains.add(domain)
      candidates.push({
        proposed_name: item.title?.split(/[—|–\-]/)[0]?.trim() ?? null,
        proposed_role: null,
        proposed_country: null,
        evidence_urls: [
          {
            platform: "google_web",
            url: item.url,
            title: item.title ?? item.url,
            snippet: item.description ?? null,
            fetched_at: new Date().toISOString(),
          },
        ],
        platform_signals: { google_web: { query, domain, provider: "brave" } },
      })
      if (candidates.length >= maxResults) break
    }
  }

  return {
    source: "google_web",
    configured: true,
    candidates,
    note: candidates.length === 0 ? (lastErrorNote ?? undefined) : undefined,
  }
}

async function extractBraveErrorReason(res: Response): Promise<string | null> {
  try {
    const text = await res.text()
    if (!text) return null
    const json = JSON.parse(text) as {
      error?: { code?: string; detail?: string; meta?: { plan?: string } }
      message?: string
    }
    const code = json.error?.code ?? null
    const detail = json.error?.detail ?? json.message ?? null
    if (code && detail) return `${code} — ${detail}`
    return code ?? detail ?? null
  } catch {
    return null
  }
}

// Legacy Google CSE path — kept verbatim for rollback via
// WEB_SEARCH_PROVIDER=google_cse. Requires:
//   GOOGLE_CSE_KEY  — API key from https://developers.google.com/custom-search/v1/introduction
//   GOOGLE_CSE_CX   — search engine id (cx)
async function searchGoogleCseLegacy(
  archetype: DiscoveryArchetype,
  maxResults: number,
  filters?: DiscoveryFilterContext,
): Promise<SearchResult> {
  const apiKey = process.env.GOOGLE_CSE_KEY
  const cx = process.env.GOOGLE_CSE_CX
  if (!apiKey || !cx) {
    return {
      source: "google_web",
      configured: false,
      note: "GOOGLE_CSE_KEY / GOOGLE_CSE_CX not set",
      candidates: [],
    }
  }

  const queries = buildQueriesFromArchetype(archetype, filters)
  let lastErrorNote: string | null = null
  const seenDomains = new Set<string>()
  const candidates: SearchCandidate[] = []

  for (const query of queries) {
    if (candidates.length >= maxResults) break
    const url = new URL("https://www.googleapis.com/customsearch/v1")
    url.searchParams.set("key", apiKey)
    url.searchParams.set("cx", cx)
    url.searchParams.set("q", query)
    url.searchParams.set("num", String(Math.min(maxResults, 10))) // CSE caps at 10/req

    let payload: {
      items?: Array<{
        title: string
        link: string
        snippet?: string
        displayLink?: string
        pagemap?: Record<string, unknown>
      }>
    } = {}

    try {
      const res = await fetch(url.toString())
      if (!res.ok) {
        const reason = await extractGoogleErrorReason(res)
        lastErrorNote = `Google CSE ${res.status}${reason ? `: ${reason}` : ""}`
        continue
      }
      payload = (await res.json()) as typeof payload
    } catch (err) {
      lastErrorNote = err instanceof Error ? err.message : "fetch failed"
      continue
    }

    for (const item of payload.items ?? []) {
      const domain = item.displayLink ?? safeHost(item.link)
      if (domain && seenDomains.has(domain)) continue
      if (domain) seenDomains.add(domain)
      candidates.push({
        proposed_name: item.title?.split(/[—|–\-]/)[0]?.trim() ?? null,
        proposed_role: null,
        proposed_country: null,
        evidence_urls: [
          {
            platform: "google_web",
            url: item.link,
            title: item.title,
            snippet: item.snippet ?? null,
            fetched_at: new Date().toISOString(),
          },
        ],
        platform_signals: { google_web: { query, domain, provider: "google_cse" } },
      })
      if (candidates.length >= maxResults) break
    }
  }

  return {
    source: "google_web",
    configured: true,
    candidates,
    note: candidates.length === 0 ? (lastErrorNote ?? undefined) : undefined,
  }
}

function safeHost(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return null
  }
}

// ─── Podcast directory (iTunes Search API) ────────────────────────────
//
// iTunes Search is a public, no-auth, official Apple API. Returns
// podcasts and the host's track/show metadata. We use it to surface
// hosts and guests who run their own podcasts — strong evidence of
// editorial fit but typically low audience (matches the brief's
// "hidden expertise" target).

async function searchPodcast(
  archetype: DiscoveryArchetype,
  maxResults: number,
  filters?: DiscoveryFilterContext,
): Promise<SearchResult> {
  const queries = buildQueriesFromArchetype(archetype, filters)
  let lastErrorNote: string | null = null
  const seenHosts = new Set<string>()
  const candidates: SearchCandidate[] = []

  for (const query of queries) {
    if (candidates.length >= maxResults) break
    const url = new URL("https://itunes.apple.com/search")
    url.searchParams.set("media", "podcast")
    url.searchParams.set("term", query)
    url.searchParams.set("limit", String(Math.min(maxResults, 50)))

    let payload: {
      resultCount?: number
      results?: Array<{
        collectionName?: string
        artistName?: string
        collectionViewUrl?: string
        feedUrl?: string
        artworkUrl100?: string
        country?: string
        genres?: string[]
        trackCount?: number
      }>
    } = {}

    try {
      const res = await fetch(url.toString(), {
        // iTunes public API — no key. They sometimes return 403 on
        // missing User-Agent.
        headers: { "User-Agent": "khatpodcast-discovery/1.0" },
      })
      if (!res.ok) {
        lastErrorNote = `iTunes Search ${res.status}`
        continue
      }
      payload = (await res.json()) as typeof payload
    } catch (err) {
      lastErrorNote = err instanceof Error ? err.message : "fetch failed"
      continue
    }

    for (const item of payload.results ?? []) {
    const host = (item.artistName ?? "").trim()
    if (!host || seenHosts.has(host.toLowerCase())) continue
    seenHosts.add(host.toLowerCase())
    candidates.push({
      proposed_name: host,
      proposed_role: "podcast host",
      proposed_country: item.country ?? null,
      evidence_urls: [
        item.collectionViewUrl
          ? {
              platform: "podcast",
              url: item.collectionViewUrl,
              title: item.collectionName ?? host,
              snippet: item.genres?.join(", ") ?? null,
              fetched_at: new Date().toISOString(),
            }
          : null,
        item.feedUrl
          ? {
              platform: "podcast",
              url: item.feedUrl,
              title: `${item.collectionName ?? host} (RSS)`,
              fetched_at: new Date().toISOString(),
            }
          : null,
      ].filter((x): x is NonNullable<typeof x> => x !== null),
      platform_signals: {
        podcast: {
          show_name: item.collectionName,
          episodes: item.trackCount ?? null,
          genres: item.genres ?? [],
        },
      },
    })
      if (candidates.length >= maxResults) break
    }
  }

  return {
    source: "podcast",
    configured: true,
    candidates,
    note: candidates.length === 0 ? (lastErrorNote ?? undefined) : undefined,
  }
}

// ─── Stubs (X / Instagram / TikTok) ───────────────────────────────────

function notConfiguredStub(source: DiscoverySource, reason: string): SearchResult {
  return { source, configured: false, note: reason, candidates: [] }
}

// ─── Public surface ──────────────────────────────────────────────────

export interface SearchAgentInput {
  archetype: DiscoveryArchetype
  source: DiscoverySource
  maxResults?: number
  /**
   * Phase B redesign — strict guest filters + episode context. Threaded
   * into the per-source query builders so per-episode runs return more
   * focused candidates. Optional for legacy season-wide runs.
   */
  filters?: DiscoveryFilterContext
  /**
   * Phase Beta — required for `source: "network"`. NetworkSource is
   * season-scoped (voice differs by season). When the job handler
   * fans out a search-archetype × network job, it reads the season id
   * from the discovery_run and forwards it here.
   */
  seasonId?: string | null
  /**
   * Phase Beta — names already on the operator's queue for this run.
   * NetworkSource uses this to skip duplicates so the same human
   * isn't surfaced twice in one run.
   */
  alreadySurfacedNames?: Set<string>
}

/**
 * Single-source search. Returns one SearchResult — never throws on
 * platform failure; instead returns an empty candidates array with a
 * clear note. The caller (job handler) decides whether to record this
 * as an error or proceed.
 *
 * Phase Beta — dispatch covers the three new sources:
 *   - editorial:    podcast guest lists + Kuwaiti newspaper profiles
 *   - public_voice: Substack / Medium / Ghost / Blogspot authors
 *   - network:      guest-of-guest extraction from prior promoted rows
 *
 * `network` is season-scoped and requires the caller to pass a
 * seasonId via the job payload. When seasonId is missing, the agent
 * returns a clean "not configured" result rather than throwing.
 */
export async function runSearchAgent(
  input: SearchAgentInput,
): Promise<SearchResult> {
  const max = input.maxResults ?? 10
  switch (input.source) {
    case "youtube":
      return searchYoutube(input.archetype, max, input.filters)
    case "google_web":
      return searchGoogleWeb(input.archetype, max, input.filters)
    case "x":
      return notConfiguredStub("x", "X/Twitter API requires elevated access; not configured")
    case "instagram":
      return notConfiguredStub("instagram", "Instagram API requires Meta Graph approval; not configured")
    case "tiktok":
      return notConfiguredStub("tiktok", "TikTok API requires partner access; not configured")
    case "podcast":
      return searchPodcast(input.archetype, max, input.filters)
    case "ai_knowledge": {
      const { runAiKnowledgeSource } = await import(
        "./sources/ai-knowledge-source"
      )
      return runAiKnowledgeSource({
        archetype: input.archetype,
        maxResults: max,
        filters: input.filters,
      })
    }
    case "editorial": {
      const { runEditorialSource } = await import("./sources/editorial-source")
      return runEditorialSource({
        archetype: input.archetype,
        maxResults: max,
        filters: input.filters,
      })
    }
    case "public_voice": {
      const { runPublicVoiceSource } = await import(
        "./sources/public-voice-source"
      )
      return runPublicVoiceSource({
        archetype: input.archetype,
        maxResults: max,
        filters: input.filters,
      })
    }
    case "network": {
      // NetworkSource needs the season id and a DB seam — both
      // supplied by the job handler. When invoked here without that
      // context (e.g. direct API call), return a clean stub.
      if (!input.seasonId) {
        return notConfiguredStub(
          "network",
          "network source requires seasonId in input",
        )
      }
      const { runNetworkSource } = await import("./sources/network-source")
      const { loadSeasonNetworkEvidence } = await import(
        "./sources/network-evidence-loader"
      )
      return runNetworkSource(
        {
          seasonId: input.seasonId,
          archetype: input.archetype,
          maxResults: max,
          filters: input.filters,
          alreadySurfacedNames: input.alreadySurfacedNames,
        },
        { loadSeasonEvidence: loadSeasonNetworkEvidence },
      )
    }
  }
}
