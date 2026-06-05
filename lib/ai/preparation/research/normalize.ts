/**
 * Source normalization + dedupe — Steps 3 and 4 of the pipeline.
 *
 * Takes raw sources from every provider and:
 *  - normalizes the URL (lowercase host, strip tracking params)
 *  - dedupes by normalized URL first, then by near-duplicate titles
 *  - assigns stable numeric ids used for citations downstream
 *  - preserves provider-specific metadata (view counts, publisher, etc.)
 */

import type { PreparationResearchSource } from "@/types/preparation"
import type { RawRetrievedSource } from "./types"

const TRACKING_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "gclid",
  "fbclid",
  "ref",
  "ref_src",
])

function normalizeUrl(raw: string): string {
  try {
    const u = new URL(raw)
    u.host = u.host.toLowerCase()
    const keep = [...u.searchParams.entries()].filter(
      ([k]) => !TRACKING_PARAMS.has(k.toLowerCase()),
    )
    u.search = ""
    for (const [k, v] of keep) u.searchParams.append(k, v)
    // Drop trailing slash and fragment for stable comparisons.
    u.hash = ""
    let s = u.toString()
    if (s.endsWith("/") && u.pathname !== "/") s = s.slice(0, -1)
    return s
  } catch {
    return raw.trim()
  }
}

function normalizeTitle(t: string): string {
  return t
    .toLowerCase()
    .replace(/[\s\u0600-\u06ff.,!?؟،:\-|–—"'()\[\]]+/g, " ")
    .trim()
}

/**
 * Normalize + dedupe raw sources. Later sources with the same URL are
 * dropped; the first (higher-priority provider order) wins.
 */
export function normalizeSources(
  raws: RawRetrievedSource[],
): PreparationResearchSource[] {
  const byUrl = new Map<string, PreparationResearchSource>()
  const byTitle = new Map<string, string>() // normalized title → canonical url

  let nextId = 1
  for (const r of raws) {
    if (!r.url || !r.title) continue
    const url = normalizeUrl(r.url)
    if (byUrl.has(url)) continue

    const tkey = normalizeTitle(r.title)
    if (tkey && byTitle.has(tkey)) continue

    const entry: PreparationResearchSource = {
      id: nextId++,
      provider: r.provider,
      title: r.title,
      url,
      snippet: (r.snippet || "").trim(),
      publisher: r.publisher,
      published_at: r.published_at,
      metrics: r.metrics,
    }
    byUrl.set(url, entry)
    if (tkey) byTitle.set(tkey, url)
  }

  return [...byUrl.values()]
}
