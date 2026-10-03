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
 *
 * Constitution (2026-09-28): market signals are a WEAK PRIOR. Only ar/en
 * clusters are eligible, clusters that trip the constitution's policy
 * lexicon (politics / religious dispute / scandal) are dropped, and only
 * a handful reach the prompt — as labels, never as raw material.
 */

import { sql, desc, isNull, and } from "drizzle-orm"
import { db } from "@/lib/db"
import { khatMapEpisodeCandidates } from "@/lib/db/schema/khat-map"
import { originalThinkingTopics } from "@/lib/db/schema/original-thinking"
import { loadPublishedEpisodeTitles } from "@/lib/khat-map/core/published-titles"
import {
  getMarketFreshness,
  type MarketFreshnessStatus,
} from "@/lib/market-intelligence/freshness"
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
import { lexiconPolicyHits } from "@/lib/khat-map/core/policy"

// ─── Caps (in sync with prompt budget) ───────────────────────────────

export const HYBRID_INPUT_CAPS = {
  /** A weak prior: a few labels, not a funnel (was 12 before the constitution). */
  market_clusters: 4,
  /** Clusters over-fetched so each run SAMPLES a different few. */
  market_cluster_pool: 36,
  original_topics: 18,
  worked_strong_domains: 5,
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
  /** Titles the PROMPT tells the AI to avoid: deduped, ordered by relevance
   *  (this season → published episodes → other seasons → consumed originals,
   *  most recent first inside each), then capped. */
  excluded_titles: string[]
  /**
   * The full lists the deterministic judge checks — never cut to the prompt
   * budget, and kept apart so each near-duplicate is reported under its own
   * rejection code.
   */
  khat_map_titles: string[]
  published_episode_titles: string[]
  consumed_original_titles: string[]
  /** Age of the market signals behind `market_clusters` (#15). */
  market_freshness: { status: MarketFreshnessStatus; age_hours: number | null } | null
  /** Useful for the snapshot row + the prompt. */
  lens_keys: string[]
}

export async function loadHybridInputs(opts: {
  language: string
  /** The season being planned — its own titles lead the exclusion list. */
  seasonId?: string | null
  extraExclusions?: string[]
}): Promise<HybridInputs> {
  const [
    clusters,
    originals,
    worked,
    candidateRows,
    consumedOriginals,
    tasteLookup,
    publishedTitles,
    freshness,
  ] = await Promise.all([
    // Over-fetch 3× the cap so a rotating SAMPLE feeds each run. Always taking
    // the same deterministic top-12 was a root cause of repetitive output —
    // identical market anchors every generation.
    getTopClusters(HYBRID_INPUT_CAPS.market_cluster_pool),
    loadFreshOriginalTopics(opts.language, HYBRID_INPUT_CAPS.original_topics),
    buildWorkedReport(),
    loadCandidateTitles(opts.seasonId ?? null),
    loadConsumedOriginalTitles(opts.language),
    loadTasteLookup(),
    // Same guard as the wizard: a failed read only shrinks the dedup lists.
    loadPublishedEpisodeTitles().catch((err) => {
      console.error("[hybrid-topics] published titles unavailable", err)
      return [] as string[]
    }),
    // A diagnostic read — its failure must not stop a generation.
    getMarketFreshness().catch(() => null),
  ])

  const seasonId = opts.seasonId ?? null
  const thisSeason = candidateRows.filter((r) => seasonId !== null && r.season_id === seasonId)
  const otherSeasons = candidateRows.filter((r) => seasonId === null || r.season_id !== seasonId)
  const excluded_titles = mergeExclusionTitles(
    [
      opts.extraExclusions ?? [],
      thisSeason.map((r) => r.working_title),
      publishedTitles,
      otherSeasons.map((r) => r.working_title),
      consumedOriginals,
    ],
    HYBRID_INPUT_CAPS.exclusion_titles,
  )

  const lens_keys = unique(originals.map((o) => o.lens))

  const clusterPool = eligibleMarketClusters(clusters, opts.language)
  // Rotate: sample the cap from the wider pool so consecutive runs see a
  // different mix of market anchors instead of the same frozen list.
  const market_clusters = sampleClusters(clusterPool, HYBRID_INPUT_CAPS.market_clusters)

  return {
    language: opts.language,
    market_clusters,
    original_topics: originals,
    worked_report: worked,
    taste_lookup: tasteLookup,
    taste_hints: dominantTasteHints(tasteLookup, HYBRID_INPUT_CAPS.taste_hints),
    excluded_titles,
    khat_map_titles: candidateRows.map((r) => r.working_title),
    published_episode_titles: publishedTitles,
    consumed_original_titles: consumedOriginals,
    market_freshness: freshness
      ? { status: freshness.status, age_hours: freshness.ageHours }
      : null,
    lens_keys,
  }
}

/**
 * The prompt's exclusion list: groups in PRIORITY order, de-duplicated
 * (whitespace/case-insensitive, first occurrence wins) BEFORE the cap.
 *
 * It used to be `unique([...].slice(0, 120))` over an unordered all-seasons
 * read: the cap ran first, so duplicates ate slots, and once there were more
 * than 120 candidate rows the season's own titles and every consumed original
 * could be cut off at random.
 */
export function mergeExclusionTitles(groups: string[][], cap: number): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const group of groups) {
    for (const raw of group) {
      const title = (raw ?? "").replace(/\s+/g, " ").trim()
      if (!title) continue
      const key = title.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      out.push(title)
      if (out.length >= cap) return out
    }
  }
  return out
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

/** Candidate titles, this season's first, then most recent first. */
async function loadCandidateTitles(
  seasonId: string | null,
): Promise<Array<{ working_title: string; season_id: string }>> {
  return await db!
    .select({
      working_title: khatMapEpisodeCandidates.working_title,
      season_id: khatMapEpisodeCandidates.season_id,
    })
    .from(khatMapEpisodeCandidates)
    .orderBy(
      ...(seasonId
        ? [sql`(${khatMapEpisodeCandidates.season_id} = ${seasonId}) DESC`]
        : []),
      desc(khatMapEpisodeCandidates.created_at),
    )
    .limit(500)
}

/** Most recently consumed first. */
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
    .orderBy(desc(originalThinkingTopics.consumed_at))
    .limit(300)
  return rows.map((r) => r.title)
}

// Published-episode titles (#18) live with the wizard's core so both engines
// share one reader; re-exported for callers/tests of the hybrid inputs.
export { loadPublishedEpisodeTitles }

/** Languages whose market signals may reach the prompt at all. */
const MARKET_LANGUAGES = new Set(["ar", "en"])

/**
 * The clusters that may reach the prompt: ar/en only (other languages are
 * dropped outright, not used as a fallback), none that trip the policy
 * lexicon on its label or hooks, and the requested language first — falling
 * back to the other eligible language only when it has none.
 */
export function eligibleMarketClusters(
  clusters: TopClusterSummary[],
  language: string,
): TopClusterSummary[] {
  const allowed = clusters.filter(
    (c) =>
      MARKET_LANGUAGES.has(c.language) &&
      lexiconPolicyHits([c.label, ...(c.narrative_hooks ?? [])].join(" ")).length === 0,
  )
  const same = allowed.filter((c) => c.language === language)
  return same.length > 0 ? same : allowed
}

function unique<T>(xs: T[]): T[] {
  return [...new Set(xs)]
}


/**
 * Sample `limit` clusters from the pool: the top third is always kept (the
 * strongest editorial signal shouldn't vanish), the rest of the slots are a
 * random draw from the remainder — so consecutive runs see a varying mix.
 */
function sampleClusters<T>(pool: T[], limit: number): T[] {
  if (pool.length <= limit) return pool
  const keep = Math.ceil(limit / 3)
  const head = pool.slice(0, keep)
  const rest = pool.slice(keep)
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[rest[i], rest[j]] = [rest[j], rest[i]]
  }
  return [...head, ...rest.slice(0, limit - keep)]
}
