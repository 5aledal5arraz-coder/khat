/**
 * Hybrid generator input loader.
 *
 * Phase 6: the unsafe `raw_signals_fallback` path is gone. The
 * generator now either:
 *   (a) runs against editorially-weighted clusters, OR
 *   (b) defers to the foundational path (originals + worked-report +
 *       taste profile) when market intelligence is genuinely empty.
 *
 * Raw, unreviewed market_topic_signals never bypass the editorial layer
 * — clustering is the only legitimate way market data influences the
 * AI prompt.
 */

import { sql, desc, isNull, and } from "drizzle-orm"
import { db } from "@/lib/db"
import { khatMapEpisodeCandidates } from "@/lib/db/schema/khat-map"
import { originalThinkingTopics } from "@/lib/db/schema/original-thinking"
import {
  getTopClusters,
  type TopClusterSummary,
} from "@/lib/market-intelligence/queries"
import {
  buildWorkedReport,
  type WorkedReport,
} from "@/lib/khat-brain/performance-learning"
import {
  loadTasteLookup,
} from "@/lib/market-intelligence/taste-learning"
import type { TasteWeightLookup } from "@/lib/market-intelligence/scoring"

// ─── Caps (in sync with prompt budget) ───────────────────────────────

export const HYBRID_INPUT_CAPS = {
  market_clusters: 12,
  original_topics: 18,
  worked_strong_domains: 5,
  worked_weak_domains: 5,
  exclusion_titles: 120,
  /** Number of dominant taste-weight keys (theme + lens + source) to
   *  surface in the prompt as a soft editorial bias. */
  taste_hints: 6,
} as const

// ─── Loader output ───────────────────────────────────────────────────

export interface HybridOriginalTopic {
  id: string
  title: string
  lens: string
  philosophical_frame: string
  conflict: string
  emotional_hook: string
}

export interface TasteHint {
  dimension: "theme" | "lens" | "source" | "tag" | "topic_domain" | "language"
  key: string
  weight: number
}

export interface HybridInputs {
  language: string
  market_clusters: TopClusterSummary[]
  original_topics: HybridOriginalTopic[]
  worked_report: WorkedReport
  /** Editorial taste lookup — used by the scorer and (soft) by the
   *  prompt builder. */
  taste_lookup: TasteWeightLookup
  /** Top N dominant taste hints — rendered into the prompt as a small
   *  "operator preference" block. */
  taste_hints: TasteHint[]
  /** Titles that the AI must avoid: existing candidates + consumed
   *  originals. */
  excluded_titles: string[]
  /** Useful for the snapshot row + the prompt. */
  lens_keys: string[]
}

export async function loadHybridInputs(opts: {
  language: string
  extraExclusions?: string[]
}): Promise<HybridInputs> {
  const [
    clusters,
    originals,
    worked,
    candidateTitles,
    consumedOriginals,
    tasteLookup,
  ] = await Promise.all([
    getTopClusters(HYBRID_INPUT_CAPS.market_clusters),
    loadFreshOriginalTopics(opts.language, HYBRID_INPUT_CAPS.original_topics),
    buildWorkedReport(),
    loadCandidateTitles(),
    loadConsumedOriginalTitles(opts.language),
    loadTasteLookup(),
  ])

  const excluded_titles = unique(
    [
      ...(opts.extraExclusions ?? []),
      ...candidateTitles,
      ...consumedOriginals,
    ].slice(0, HYBRID_INPUT_CAPS.exclusion_titles),
  )

  const lens_keys = unique(originals.map((o) => o.lens))

  // Filter market clusters by language. Fall back to all clusters if
  // the requested language has zero clusters yet.
  const clustersFiltered = clusters.filter((c) => c.language === opts.language)
  const market_clusters = clustersFiltered.length > 0 ? clustersFiltered : clusters

  return {
    language: opts.language,
    market_clusters,
    original_topics: originals,
    worked_report: worked,
    taste_lookup: tasteLookup,
    taste_hints: dominantTasteHints(tasteLookup, HYBRID_INPUT_CAPS.taste_hints),
    excluded_titles,
    lens_keys,
  }
}

/** Pull the strongest absolute-value weights from each dimension. The
 *  generator surfaces these in the prompt so the AI sees operator
 *  preferences without a hard filter (soft influence). */
function dominantTasteHints(
  lookup: TasteWeightLookup,
  limit: number,
): TasteHint[] {
  const all: TasteHint[] = []
  for (const [key, weight] of lookup.byTheme) all.push({ dimension: "theme", key, weight })
  for (const [key, weight] of lookup.bySource) all.push({ dimension: "source", key, weight })
  for (const [key, weight] of lookup.byLanguage) all.push({ dimension: "language", key, weight })
  for (const [key, weight] of lookup.byTag) all.push({ dimension: "tag", key, weight })
  return all
    .filter((h) => Math.abs(h.weight) >= 0.05)
    .sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight))
    .slice(0, limit)
}

// ─── Helpers ─────────────────────────────────────────────────────────

async function loadFreshOriginalTopics(
  language: string,
  limit: number,
): Promise<HybridOriginalTopic[]> {
  const rows = await db!
    .select({
      id: originalThinkingTopics.id,
      title: originalThinkingTopics.title,
      lens: originalThinkingTopics.lens,
      philosophical_frame: originalThinkingTopics.philosophical_frame,
      conflict: originalThinkingTopics.conflict,
      emotional_hook: originalThinkingTopics.emotional_hook,
    })
    .from(originalThinkingTopics)
    .where(
      and(
        sql`${originalThinkingTopics.language} = ${language}`,
        isNull(originalThinkingTopics.consumed_at),
        sql`${originalThinkingTopics.expires_at} > now()`,
      ),
    )
    .orderBy(desc(originalThinkingTopics.generated_at))
    .limit(limit)
  return rows
}

async function loadCandidateTitles(): Promise<string[]> {
  const rows = await db!
    .select({ working_title: khatMapEpisodeCandidates.working_title })
    .from(khatMapEpisodeCandidates)
    .limit(500)
  return rows.map((r) => r.working_title)
}

async function loadConsumedOriginalTitles(language: string): Promise<string[]> {
  const rows = await db!
    .select({ title: originalThinkingTopics.title })
    .from(originalThinkingTopics)
    .where(
      and(
        sql`${originalThinkingTopics.consumed_at} IS NOT NULL`,
        sql`${originalThinkingTopics.language} = ${language}`,
      ),
    )
    .limit(300)
  return rows.map((r) => r.title)
}

function unique<T>(xs: T[]): T[] {
  return [...new Set(xs)]
}
