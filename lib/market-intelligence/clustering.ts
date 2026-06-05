/**
 * Phase X Step 1 — clusters signals by (theme, language).
 *
 *   recomputeClusters({ lookbackDays })
 *     1. Reads extracted signals from the last N days.
 *     2. Buckets by (theme, language).
 *     3. For each bucket, computes signal_count, dominant emotions,
 *        median view_signal, source breakdown, and a small narrative-
 *        hook list (top titles).
 *     4. Wipes + rewrites `market_topic_clusters` atomically (since
 *        clusters are a projection, not state).
 *
 * Tunables:
 *   MIN_BUCKET_SAMPLE = 2   — themes need ≥2 signals to form a cluster.
 *   MAX_HOOKS_PER_CLUSTER = 5
 */

import { sql, gte, isNotNull, and, notInArray } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  marketTopicSignals,
  marketTopicClusters,
} from "@/lib/db/schema/market-intelligence"

const MIN_BUCKET_SAMPLE = 2
const MAX_HOOKS_PER_CLUSTER = 5

// Phase 6 — per-signal contribution weights. A signal's contribution
// to its bucket = product of these multipliers, capped at 3.0.
const CONTRIB_BASE = 1.0
const CONTRIB_APPROVED_MULT = 1.5
const CONTRIB_OPERATOR_MULT = 1.4
const CONTRIB_TRUSTED_MULT = 1.2
const CONTRIB_EDITORIAL_TAG_MULT = 1.2 // for: deep | timeless | emotional | strong
const CONTRIB_SCORE_LIFT_MAX = 0.5 // signal_score scales 0..0.5 added to multiplier
const CONTRIB_CAP = 3.0
const EDITORIAL_TAGS_BOOSTING = new Set([
  "deep",
  "timeless",
  "emotional",
  "strong",
])

// Index signature matches the job-registry constraint
// (`JobHandler<P extends Record<string, unknown>, R extends Record<string, unknown>>`).
// Concrete fields stay strictly typed.
export interface ClusterRunResult extends Record<string, unknown> {
  scanned: number
  written: number
  buckets_skipped: number
}

export async function recomputeClusters(opts?: {
  lookbackDays?: number
}): Promise<ClusterRunResult> {
  const lookbackDays = opts?.lookbackDays ?? 90
  const since = new Date(Date.now() - lookbackDays * 86400_000)

  const signals = await db!
    .select({
      theme: marketTopicSignals.theme,
      emotional_trigger: marketTopicSignals.emotional_trigger,
      language: marketTopicSignals.language,
      view_signal: marketTopicSignals.view_signal,
      source: marketTopicSignals.source,
      title: marketTopicSignals.title,
      // Phase 6: editorial inputs for weighted contribution
      review_status: marketTopicSignals.review_status,
      editorial_tags: marketTopicSignals.editorial_tags,
      operator_created: marketTopicSignals.operator_created,
      trusted_source_id: marketTopicSignals.trusted_source_id,
      signal_score: marketTopicSignals.signal_score,
    })
    .from(marketTopicSignals)
    .where(
      and(
        isNotNull(marketTopicSignals.theme),
        gte(marketTopicSignals.collected_at, since),
        // Phase 6: editorial decisions filter clustering. Rejected
        // and archived signals never contribute. `new` and `approved`
        // do — `new` at base weight, `approved` at boosted weight.
        notInArray(marketTopicSignals.review_status, ["rejected", "archived"]),
      ),
    )

  interface Bucket {
    theme: string
    language: string
    emotions: Map<string, number>
    sources: Map<string, number>
    views: number[]
    /** title + per-signal contribution weight (popularity-independent;
     *  used for sorting the narrative-hook excerpt to favour reviewed
     *  signals over high-view-but-unreviewed ones). */
    titles: Array<{ title: string; weight: number; contribution: number }>
    /** Sum of per-signal contribution weights — Phase 6 editorial_score. */
    editorial_score: number
  }
  const buckets = new Map<string, Bucket>()

  for (const s of signals) {
    if (!s.theme) continue
    const contribution = contributionWeight(s)
    const key = `${s.theme}|${s.language}`
    let b = buckets.get(key)
    if (!b) {
      b = {
        theme: s.theme,
        language: s.language,
        emotions: new Map(),
        sources: new Map(),
        views: [],
        titles: [],
        editorial_score: 0,
      }
      buckets.set(key, b)
    }
    if (s.emotional_trigger && s.emotional_trigger !== "none") {
      b.emotions.set(
        s.emotional_trigger,
        (b.emotions.get(s.emotional_trigger) ?? 0) + 1,
      )
    }
    b.sources.set(s.source, (b.sources.get(s.source) ?? 0) + 1)
    if (typeof s.view_signal === "number" && Number.isFinite(s.view_signal)) {
      b.views.push(s.view_signal)
    }
    b.titles.push({
      title: s.title,
      weight: s.view_signal ?? 0,
      contribution,
    })
    b.editorial_score += contribution
  }

  function contributionWeight(s: {
    review_status?: string | null
    editorial_tags?: unknown
    operator_created?: boolean | null
    trusted_source_id?: string | null
    signal_score?: number | null
  }): number {
    let w = CONTRIB_BASE
    if (s.review_status === "approved") w *= CONTRIB_APPROVED_MULT
    if (s.operator_created === true) w *= CONTRIB_OPERATOR_MULT
    if (s.trusted_source_id) w *= CONTRIB_TRUSTED_MULT
    const tags = Array.isArray(s.editorial_tags)
      ? (s.editorial_tags as string[])
      : []
    if (tags.some((t) => EDITORIAL_TAGS_BOOSTING.has(t)))
      w *= CONTRIB_EDITORIAL_TAG_MULT
    // Soft additive lift from signal_score (avoids popularity-alone domination).
    if (typeof s.signal_score === "number" && Number.isFinite(s.signal_score)) {
      w += Math.max(0, Math.min(1, s.signal_score)) * CONTRIB_SCORE_LIFT_MAX
    }
    return Math.min(CONTRIB_CAP, w)
  }

  // Wipe + rewrite as a single transaction-like sequence.
  await db!.execute(sql`DELETE FROM market_topic_clusters`)

  let written = 0
  let skipped = 0
  for (const b of buckets.values()) {
    if (b.titles.length < MIN_BUCKET_SAMPLE) {
      skipped++
      continue
    }
    const dominant_emotions = [...b.emotions.entries()]
      .sort((a, c) => c[1] - a[1])
      .slice(0, 3)
      .map((e) => e[0])
    const source_breakdown: Record<string, number> = {}
    for (const [k, v] of b.sources) source_breakdown[k] = v
    // median() can return a non-integer for even-length arrays; round before
    // insert since median_view_signal is a bigint column.
    const rawMedian = b.views.length > 0 ? median(b.views) : null
    const median_view_signal = rawMedian === null ? null : Math.round(rawMedian)
    // Phase 6: rank narrative hooks by editorial contribution first,
    // popularity second — so trusted/approved signals lead the prompt.
    const narrative_hooks = b.titles
      .slice()
      .sort((a, c) =>
        c.contribution !== a.contribution
          ? c.contribution - a.contribution
          : c.weight - a.weight,
      )
      .slice(0, MAX_HOOKS_PER_CLUSTER)
      .map((t) => t.title)

    await db!.insert(marketTopicClusters).values({
      label: b.theme,
      language: b.language,
      signal_count: b.titles.length,
      dominant_themes: [b.theme],
      dominant_emotions,
      median_view_signal,
      source_breakdown,
      narrative_hooks,
      editorial_score: b.editorial_score,
    })
    written++
  }
  return { scanned: signals.length, written, buckets_skipped: skipped }
}

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const s = [...values].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m]
}
