/**
 * Phase Beta — PublicVoiceSource.
 *
 * Targets writers / essayists / thinkers whose primary public surface
 * is text-publishing platforms (Substack, Medium, personal blogs)
 * rather than YouTube or Instagram. The current pipeline misses this
 * cohort entirely because YouTube + iTunes + general web search rank
 * video/podcast results far above newsletter / blog hits.
 *
 * Strategy:
 *   1. Brave site-scoped queries against Substack, Medium, and a
 *      curated list of Gulf-region blogging platforms.
 *   2. Each result yields ONE author candidate. The URL is a strong
 *      bio_page signal (`/about` or profile root), and the
 *      proposed_name is the author handle stripped from the URL.
 *
 * Substack URL shapes we recognise:
 *   https://<handle>.substack.com/                 → handle = name proxy
 *   https://<handle>.substack.com/p/<slug>         → handle = name proxy
 *   https://<handle>.substack.com/about            → strongest signal
 *
 * Medium URL shapes:
 *   https://medium.com/@<handle>/...               → @-handle
 *   https://medium.com/@<handle>                   → profile root
 *   https://<custom>.medium.com/<slug>             → custom subdomain
 *
 * Because Substack/Medium authors typically use real names as their
 * handle ("@khalid-alrashidi") or pen names ("@khalid.writes"), we
 * extract from the URL but DO NOT trust the value as a final name —
 * it becomes a SEED for the verifier to confirm against bio content.
 */

import type { DiscoveryArchetype } from "@/lib/db/schema/discovery"
import type {
  SearchResult,
  SearchCandidate,
  DiscoveryFilterContext,
} from "../search-agents"

export const PUBLIC_VOICE_SOURCE_VERSION = "beta-public-voice-1" as const

const TARGET_PLATFORMS = [
  { domain: "substack.com", subSource: "substack" as const },
  { domain: "medium.com", subSource: "medium" as const },
  { domain: "ghost.io", subSource: "ghost" as const },
  { domain: "blogspot.com", subSource: "blogspot" as const },
]

/**
 * Extract a probable author handle / display name from a Substack or
 * Medium URL. Returns null when the URL doesn't carry a name token.
 */
export function extractAuthorFromUrl(url: string): {
  name: string
  platform: "substack" | "medium" | "ghost" | "blogspot" | "blog"
} | null {
  if (!url) return null
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return null
  }
  const host = u.hostname.toLowerCase()
  const path = u.pathname

  // Substack: <handle>.substack.com
  if (host.endsWith(".substack.com")) {
    const handle = host.slice(0, host.indexOf(".substack.com"))
    if (handle && handle !== "www") {
      return { name: humanise(handle), platform: "substack" }
    }
  }
  // Medium: medium.com/@<handle>
  if (host === "medium.com" || host === "www.medium.com") {
    const m = path.match(/^\/@([^/]+)/)
    if (m && m[1]) {
      return { name: humanise(m[1]), platform: "medium" }
    }
  }
  // Medium custom: <handle>.medium.com
  if (host.endsWith(".medium.com")) {
    const handle = host.slice(0, host.indexOf(".medium.com"))
    if (handle && handle !== "www") {
      return { name: humanise(handle), platform: "medium" }
    }
  }
  // Ghost: <handle>.ghost.io
  if (host.endsWith(".ghost.io")) {
    const handle = host.slice(0, host.indexOf(".ghost.io"))
    if (handle && handle !== "www") {
      return { name: humanise(handle), platform: "ghost" }
    }
  }
  // Blogspot
  if (host.endsWith(".blogspot.com")) {
    const handle = host.slice(0, host.indexOf(".blogspot.com"))
    if (handle && handle !== "www") {
      return { name: humanise(handle), platform: "blogspot" }
    }
  }
  return null
}

/**
 * "khalid-alrashidi" → "Khalid Al-Rashidi"
 * "khalid.writes"    → "Khalid Writes"  (writer pen-name, kept as-is)
 * "khalidalrashidi"  → null (no separators; we don't try to split)
 */
function humanise(handle: string): string {
  const clean = handle.replace(/[\d_]+/g, " ").trim()
  if (!clean.includes("-") && !clean.includes(".") && !clean.includes("_")) {
    // No separator → ambiguous; better to return as-is title-cased
    return titleCase(clean)
  }
  return clean
    .split(/[-._]+/)
    .filter(Boolean)
    .map(titleCase)
    .join(" ")
}

function titleCase(s: string): string {
  if (!s) return s
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
}

// ─── Brave querying ─────────────────────────────────────────────────

export interface PublicVoiceSourceInput {
  archetype: DiscoveryArchetype
  maxResults: number
  filters?: DiscoveryFilterContext
}

export async function runPublicVoiceSource(
  input: PublicVoiceSourceInput,
): Promise<SearchResult> {
  const apiKey = process.env.BRAVE_SEARCH_KEY
  if (!apiKey) {
    return {
      source: "public_voice",
      configured: false,
      note: "BRAVE_SEARCH_KEY not set",
      candidates: [],
    }
  }

  const archetypeAnchors = [
    ...(input.archetype.target_signals ?? []),
    input.archetype.name,
    ...(input.archetype.expected_traits ?? []),
  ].filter((s): s is string => Boolean(s && s.length >= 3))

  if (archetypeAnchors.length === 0) {
    return {
      source: "public_voice",
      configured: true,
      note: "no archetype anchors",
      candidates: [],
    }
  }

  const out: SearchCandidate[] = []
  const seenNames = new Set<string>()
  let lastError: string | null = null

  for (const platform of TARGET_PLATFORMS) {
    if (out.length >= input.maxResults) break
    for (const anchor of archetypeAnchors.slice(0, 3)) {
      if (out.length >= input.maxResults) break
      // Build a query that biases toward Kuwait when the filter calls
      // for it. We deliberately don't NEGATE non-Kuwait — the
      // attribute verifier handles that downstream.
      const kuwaitBias =
        input.filters?.nationality === "kuwaiti" ? " الكويت" : ""
      const query = `site:${platform.domain} ${anchor}${kuwaitBias}`.slice(
        0,
        180,
      )
      const url = new URL("https://api.search.brave.com/res/v1/web/search")
      url.searchParams.set("q", query)
      url.searchParams.set("count", "10")
      try {
        const res = await fetch(url.toString(), {
          headers: {
            Accept: "application/json",
            "X-Subscription-Token": apiKey,
          },
        })
        if (!res.ok) {
          lastError = `Brave ${res.status} on ${platform.subSource}`
          continue
        }
        const payload = (await res.json()) as {
          web?: {
            results?: Array<{
              title?: string
              url?: string
              description?: string
            }>
          }
        }
        for (const item of payload.web?.results ?? []) {
          if (out.length >= input.maxResults) break
          if (!item.url) continue
          const author = extractAuthorFromUrl(item.url)
          if (!author) continue
          const key = `${author.platform}::${author.name.toLowerCase()}`
          if (seenNames.has(key)) continue
          seenNames.add(key)
          out.push({
            proposed_name: author.name,
            proposed_role: `${author.platform} author`,
            proposed_country:
              input.filters?.nationality === "kuwaiti" ? "Kuwait" : null,
            evidence_urls: [
              {
                platform: "public_voice",
                url: item.url,
                title: item.title ?? null,
                snippet: item.description ?? null,
                fetched_at: new Date().toISOString(),
              },
            ],
            platform_signals: {
              public_voice: {
                sub_source: author.platform,
                handle_inferred: author.name,
                query,
              },
            },
          })
        }
      } catch (err) {
        lastError = err instanceof Error ? err.message : "fetch failed"
        continue
      }
    }
  }

  return {
    source: "public_voice",
    configured: true,
    note:
      out.length === 0
        ? (lastError ?? "no Substack/Medium hits matched archetype")
        : undefined,
    candidates: out,
  }
}
