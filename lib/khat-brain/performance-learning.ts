/**
 * Khat Brain Phase 8 — performance learning loop.
 *
 * For every published EIR with at least one snapshot:
 *   1. Pick rolling-window views at 7d / 14d / 28d (best snapshot
 *      closest to the boundary, with a 48h tolerance).
 *   2. Compute engagement metrics from the latest snapshot.
 *   3. Compute view velocities (views/day across each window).
 *   4. Compute editorial_signal_score = 0.5*views + 0.3*engagement + 0.2*comments.
 *      Each component is in [0, 1] with explicit sample-size guards.
 *   5. Upsert into episode_performance_signals (one row per EIR).
 *
 * Documented formula:
 *
 *   normalized_views_score
 *     = views_at_28d   if available
 *     = views_at_14d * 1.5 if no 28d
 *     = views_at_7d  * 2.0 if no 14d
 *     ; then divided by season-median (or global median) of views_at_28d.
 *     ; clamped to [0, 1].
 *
 *   engagement_rate_score = (likes + comments) / max(views, 1)
 *     ; with min sample guard (require views ≥ 50 or score capped at 0.3)
 *     ; clamped to [0, 1] after multiplying by 25 (engagement rates above
 *     ;   4% are exceptional in Arabic podcast YouTube).
 *
 *   comment_rate_score = comments / max(views, 1) × 100
 *     ; capped at 1.0 (1% comment rate = excellent).
 *
 * Sample-size guard: we DO NOT compute a signal for an EIR with
 * fewer than 2 snapshots (need at least one before-and-after to
 * compute velocity), or with view_count < MIN_VIEWS_FOR_SCORE = 50.
 *
 * All numbers are stored as `real`; explanations live in `explanation`
 * JSONB.
 */

import { and, desc, eq, gt, inArray, isNull, lt, lte, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { episodeIntelligenceRecords, type EpisodePhase } from "@/lib/db/schema/eir"
import { performanceSnapshots } from "@/lib/db/schema/studio-analysis"
import {
  episodePerformanceSignals,
  type PerformanceSignalBaseline,
  type PerformanceSignalExplanation,
} from "@/lib/db/schema/performance-signals"
import { applySourceFeedbackForEir } from "@/lib/market-intelligence/source-feedback"

// ─── Tunables ────────────────────────────────────────────────────────

const WINDOW_TOLERANCE_HOURS = 48
const MIN_VIEWS_FOR_SCORE = 50
const ENGAGEMENT_NORM = 25 // 4% engagement → score 1.0
const COMMENT_NORM = 100 // 1% comment rate → score 1.0
const WEIGHTS = { normalized_views: 0.5, engagement: 0.3, comment: 0.2 } as const

// ─── Helpers ─────────────────────────────────────────────────────────

interface RawSnap {
  snapshot_at: Date
  view_count: number | null
  like_count: number | null
  comment_count: number | null
}

function num(v: string | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/**
 * Pick the snapshot whose age relative to the publish anchor is
 * closest to `windowDays` × 24h. Falls back to the most recent
 * snapshot before the boundary if nothing is on the boundary.
 */
function pickWindow(
  publishAnchor: Date,
  windowDays: number,
  snapshots: RawSnap[],
): { snap: RawSnap | null; distance_hours: number | null; fit: string } {
  if (snapshots.length === 0) return { snap: null, distance_hours: null, fit: "missing" }
  const targetMs = publishAnchor.getTime() + windowDays * 86400_000
  const tolMs = WINDOW_TOLERANCE_HOURS * 3600_000
  let best: { snap: RawSnap; deltaMs: number } | null = null
  for (const s of snapshots) {
    const delta = Math.abs(s.snapshot_at.getTime() - targetMs)
    if (!best || delta < best.deltaMs) best = { snap: s, deltaMs: delta }
  }
  if (!best) return { snap: null, distance_hours: null, fit: "missing" }
  const distance_hours = Math.round((best.deltaMs / 3600_000) * 10) / 10
  const fit =
    best.deltaMs <= tolMs
      ? "exact"
      : best.snap.snapshot_at.getTime() < targetMs
        ? "before"
        : "after"
  return { snap: best.snap, distance_hours, fit }
}

/** Median of an array of numbers (small datasets — O(n log n) is fine). */
function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const m = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[m - 1] + sorted[m]) / 2 : sorted[m]
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))

// ─── Per-EIR analysis ────────────────────────────────────────────────

export interface AnalyzeEirResult {
  eir_id: string
  ok: boolean
  reason?: string
  signal: typeof episodePerformanceSignals.$inferSelect | null
}

export async function analyzeEirPerformance(
  eirId: string,
): Promise<AnalyzeEirResult> {
  // Pull the EIR + ALL its snapshots (sorted oldest first).
  const eirRows = await db!
    .select({
      id: episodeIntelligenceRecords.id,
      phase: episodeIntelligenceRecords.phase,
      season_id: episodeIntelligenceRecords.season_id,
    })
    .from(episodeIntelligenceRecords)
    .where(eq(episodeIntelligenceRecords.id, eirId))
    .limit(1)
  const eir = eirRows[0]
  if (!eir) return { eir_id: eirId, ok: false, reason: "EIR not found", signal: null }

  const snapsRaw = await db!
    .select()
    .from(performanceSnapshots)
    .where(eq(performanceSnapshots.eir_id, eirId))
    .orderBy(performanceSnapshots.snapshot_at)
  const snapshots: RawSnap[] = snapsRaw.map((s) => ({
    snapshot_at: s.snapshot_at,
    view_count: num(s.view_count),
    like_count: num(s.like_count),
    comment_count: num(s.comment_count),
  }))
  if (snapshots.length === 0) {
    return { eir_id: eirId, ok: false, reason: "no snapshots", signal: null }
  }

  const publishAnchor = snapshots[0].snapshot_at
  const latest = snapshots[snapshots.length - 1]
  const latestViews = latest.view_count ?? 0

  // Sample-size guard.
  if (latestViews < MIN_VIEWS_FOR_SCORE) {
    return {
      eir_id: eirId,
      ok: false,
      reason: `latest views below threshold (${latestViews} < ${MIN_VIEWS_FOR_SCORE})`,
      signal: null,
    }
  }

  // Rolling windows.
  const w7 = pickWindow(publishAnchor, 7, snapshots)
  const w14 = pickWindow(publishAnchor, 14, snapshots)
  const w28 = pickWindow(publishAnchor, 28, snapshots)

  const views7 = w7.snap?.view_count ?? null
  const views14 = w14.snap?.view_count ?? null
  const views28 = w28.snap?.view_count ?? null

  const velocity = (views: number | null, days: number) =>
    views !== null && days > 0 ? views / days : null
  const view_velocity_7d = velocity(views7, 7)
  const view_velocity_14d = velocity(views14, 14)
  const view_velocity_28d = velocity(views28, 28)

  // Engagement (latest).
  const likes = latest.like_count ?? 0
  const comments = latest.comment_count ?? 0
  const like_rate = latestViews > 0 ? likes / latestViews : null
  const comment_rate = latestViews > 0 ? comments / latestViews : null
  const engagement_rate = latestViews > 0 ? (likes + comments) / latestViews : null

  // Baseline — season median if available, else global median.
  const baseline = await pickBaseline(eir.season_id, eirId)

  // Component scores.
  const projected28 =
    views28 ?? (views14 !== null ? views14 * 1.5 : views7 !== null ? views7 * 2.0 : null)
  const normalized_views_score =
    projected28 !== null && baseline.median_views && baseline.median_views > 0
      ? clamp01(projected28 / baseline.median_views)
      : projected28 !== null
        ? clamp01(projected28 / 10_000) // absolute floor when no baseline
        : null

  const engagement_rate_score =
    engagement_rate !== null
      ? latestViews >= MIN_VIEWS_FOR_SCORE
        ? clamp01(engagement_rate * ENGAGEMENT_NORM)
        : Math.min(0.3, engagement_rate * ENGAGEMENT_NORM)
      : null

  const comment_rate_score =
    comment_rate !== null ? clamp01(comment_rate * COMMENT_NORM) : null

  // Composite — only include components we have, with weight renormalization.
  const components: Array<{ score: number; weight: number }> = []
  if (normalized_views_score !== null)
    components.push({ score: normalized_views_score, weight: WEIGHTS.normalized_views })
  if (engagement_rate_score !== null)
    components.push({ score: engagement_rate_score, weight: WEIGHTS.engagement })
  if (comment_rate_score !== null)
    components.push({ score: comment_rate_score, weight: WEIGHTS.comment })
  const totalWeight = components.reduce((a, c) => a + c.weight, 0)
  const editorial_signal_score =
    totalWeight > 0
      ? components.reduce((a, c) => a + (c.score * c.weight) / totalWeight, 0)
      : null

  const explanation: PerformanceSignalExplanation = {
    publish_anchor_at: publishAnchor.toISOString(),
    windows: {
      "7d": {
        chosen_snapshot_at: w7.snap?.snapshot_at.toISOString() ?? null,
        views: views7,
        distance_hours: w7.distance_hours,
        fit: w7.fit,
      },
      "14d": {
        chosen_snapshot_at: w14.snap?.snapshot_at.toISOString() ?? null,
        views: views14,
        distance_hours: w14.distance_hours,
        fit: w14.fit,
      },
      "28d": {
        chosen_snapshot_at: w28.snap?.snapshot_at.toISOString() ?? null,
        views: views28,
        distance_hours: w28.distance_hours,
        fit: w28.fit,
      },
    },
    baseline: {
      type: baseline.type,
      median_views: baseline.median_views,
      sample_size: baseline.sample_size,
    },
    components: {
      normalized_views_score,
      engagement_rate_score,
      comment_rate_score,
    },
    weights: WEIGHTS,
    notes: [
      `latest snapshot: ${latestViews.toLocaleString()} views`,
      baseline.median_views
        ? `${baseline.type} baseline median = ${Math.round(baseline.median_views).toLocaleString()} (n=${baseline.sample_size})`
        : "no baseline available — used absolute floor (10k)",
      editorial_signal_score === null
        ? "no components available — score is null"
        : `composite ${editorial_signal_score.toFixed(3)} from ${components.length} components`,
    ],
  }

  // Upsert.
  await db!
    .insert(episodePerformanceSignals)
    .values({
      eir_id: eirId,
      views_at_7d: views7,
      views_at_14d: views14,
      views_at_28d: views28,
      like_rate,
      comment_rate,
      engagement_rate,
      view_velocity_7d,
      view_velocity_14d,
      view_velocity_28d,
      editorial_signal_score,
      baseline_used: baseline.type,
      explanation,
      calculated_at: new Date(),
    })
    .onConflictDoUpdate({
      target: episodePerformanceSignals.eir_id,
      set: {
        views_at_7d: views7,
        views_at_14d: views14,
        views_at_28d: views28,
        like_rate,
        comment_rate,
        engagement_rate,
        view_velocity_7d,
        view_velocity_14d,
        view_velocity_28d,
        editorial_signal_score,
        baseline_used: baseline.type,
        explanation,
        calculated_at: new Date(),
        updated_at: new Date(),
      },
    })

  // Read back.
  const fresh = await db!
    .select()
    .from(episodePerformanceSignals)
    .where(eq(episodePerformanceSignals.eir_id, eirId))
    .limit(1)

  // Feed signal back to khat_map_episode_performance via the existing
  // channel — the candidate-side performance score uses different math
  // (composite from quote density + view count) so we don't overwrite
  // it. Instead we let the next syncSeasonPerformance pick up the
  // refreshed view_count from the YouTube worker. The Khat Map taste
  // recompute already weights performance via that table.

  // Third learning loop — nudge the trust of the market sources that inspired
  // this episode's topic, now that we know how it performed. Fire-and-forget
  // and idempotent; never blocks the performance compute.
  void applySourceFeedbackForEir(eirId).catch((err) =>
    console.error("[performance-learning] source feedback failed for", eirId, err),
  )

  return { eir_id: eirId, ok: true, signal: fresh[0] ?? null }
}

// ─── Baseline picker ─────────────────────────────────────────────────

interface Baseline {
  type: PerformanceSignalBaseline
  median_views: number | null
  sample_size: number
}

async function pickBaseline(
  seasonId: string | null,
  excludeEirId: string,
): Promise<Baseline> {
  // Prefer season median.
  if (seasonId) {
    const peers = await db!
      .select({
        eir_id: episodePerformanceSignals.eir_id,
        views: episodePerformanceSignals.views_at_28d,
      })
      .from(episodePerformanceSignals)
      .innerJoin(
        episodeIntelligenceRecords,
        eq(episodeIntelligenceRecords.id, episodePerformanceSignals.eir_id),
      )
      .where(
        and(
          eq(episodeIntelligenceRecords.season_id, seasonId),
          // exclude this EIR
          sql`${episodePerformanceSignals.eir_id} <> ${excludeEirId}`,
        ),
      )
    const seasonViews = peers.map((p) => p.views).filter((v): v is number => v !== null && v > 0)
    if (seasonViews.length >= 3) {
      return {
        type: "season",
        median_views: median(seasonViews),
        sample_size: seasonViews.length,
      }
    }
  }

  // Fallback to global median.
  const globalRows = await db!
    .select({ views: episodePerformanceSignals.views_at_28d })
    .from(episodePerformanceSignals)
  const globalViews = globalRows.map((r) => r.views).filter((v): v is number => v !== null && v > 0)
  if (globalViews.length >= 5) {
    return {
      type: "global",
      median_views: median(globalViews),
      sample_size: globalViews.length,
    }
  }
  return { type: "absolute", median_views: null, sample_size: 0 }
}

// ─── Batch ────────────────────────────────────────────────────────────

export interface BatchAnalysisResult {
  scanned: number
  ok: number
  skipped: Array<{ eir_id: string; reason: string }>
}

/**
 * Run analysis across every published / analyzing / learned EIR. Used
 * by the YouTube worker after a snapshot batch lands, and by the
 * smoke test.
 */
export async function batchAnalyzePerformance(): Promise<BatchAnalysisResult> {
  const eligiblePhases: EpisodePhase[] = ["published", "analyzing", "learned"]
  const eirRows = await db!
    .select({ id: episodeIntelligenceRecords.id })
    .from(episodeIntelligenceRecords)
    .where(
      and(
        inArray(episodeIntelligenceRecords.phase, eligiblePhases),
        isNull(episodeIntelligenceRecords.archived_at),
      ),
    )
  let ok = 0
  const skipped: Array<{ eir_id: string; reason: string }> = []
  for (const r of eirRows) {
    const result = await analyzeEirPerformance(r.id)
    if (result.ok) ok++
    else skipped.push({ eir_id: r.id, reason: result.reason ?? "unknown" })
  }
  return { scanned: eirRows.length, ok, skipped }
}

// ─── Aggregation: What Worked / What Didn't ──────────────────────────

const MIN_BUCKET_SAMPLE = 3
const STRONG_SCORE = 0.6
const WEAK_SCORE = 0.35

export interface DimensionInsight {
  /** The grouping key value (e.g. "philosophy" for topic_domain). */
  key: string
  /** Number of episodes in this bucket. */
  sample_size: number
  /** Mean editorial_signal_score across the bucket. */
  mean_score: number
  /** Median view count at 28d (null if insufficient). */
  median_views: number | null
}

export interface WorkedReport {
  generated_at: string
  /** Episodes ranked by signal (top + bottom). */
  top_episodes: EpisodeInsight[]
  weak_episodes: EpisodeInsight[]
  /** Topic-domain insights (samples ≥ MIN_BUCKET_SAMPLE only). */
  strong_topic_domains: DimensionInsight[]
  weak_topic_domains: DimensionInsight[]
  /** Episode-type insights. */
  strong_episode_types: DimensionInsight[]
  weak_episode_types: DimensionInsight[]
  /** Guest insights — same human across multiple episodes. */
  strong_guests: DimensionInsight[]
  /** Plain-text editor recommendations. */
  recommendations: string[]
}

export interface EpisodeInsight {
  eir_id: string
  working_title: string
  topic_domain: string | null
  episode_type: string | null
  signal_score: number
  views_at_28d: number | null
}

export async function buildWorkedReport(): Promise<WorkedReport> {
  const rows = await db!
    .select({
      eir_id: episodePerformanceSignals.eir_id,
      score: episodePerformanceSignals.editorial_signal_score,
      views_at_28d: episodePerformanceSignals.views_at_28d,
      working_title: episodeIntelligenceRecords.working_title,
      topic_domain: episodeIntelligenceRecords.topic_domain,
      episode_type: episodeIntelligenceRecords.episode_type,
      guest_id: episodeIntelligenceRecords.guest_id,
    })
    .from(episodePerformanceSignals)
    .innerJoin(
      episodeIntelligenceRecords,
      eq(episodeIntelligenceRecords.id, episodePerformanceSignals.eir_id),
    )

  const scored = rows
    .filter((r) => r.score !== null)
    .map((r) => ({
      ...r,
      score: Number(r.score),
      views_at_28d: r.views_at_28d === null ? null : Number(r.views_at_28d),
    }))

  // Top + bottom episodes.
  const byScore = [...scored].sort((a, b) => b.score - a.score)
  const top_episodes: EpisodeInsight[] = byScore.slice(0, 5).map((r) => ({
    eir_id: r.eir_id,
    working_title: r.working_title,
    topic_domain: r.topic_domain,
    episode_type: r.episode_type,
    signal_score: r.score,
    views_at_28d: r.views_at_28d,
  }))
  const weak_episodes: EpisodeInsight[] = byScore
    .slice(-5)
    .reverse()
    .map((r) => ({
      eir_id: r.eir_id,
      working_title: r.working_title,
      topic_domain: r.topic_domain,
      episode_type: r.episode_type,
      signal_score: r.score,
      views_at_28d: r.views_at_28d,
    }))

  // Bucket by topic_domain.
  const domainBuckets = new Map<string, { scores: number[]; views: number[] }>()
  const typeBuckets = new Map<string, { scores: number[]; views: number[] }>()
  const guestBuckets = new Map<string, { scores: number[]; views: number[] }>()
  for (const r of scored) {
    if (r.topic_domain) {
      const b = domainBuckets.get(r.topic_domain) ?? { scores: [], views: [] }
      b.scores.push(r.score)
      if (r.views_at_28d !== null) b.views.push(r.views_at_28d)
      domainBuckets.set(r.topic_domain, b)
    }
    if (r.episode_type) {
      const b = typeBuckets.get(r.episode_type) ?? { scores: [], views: [] }
      b.scores.push(r.score)
      if (r.views_at_28d !== null) b.views.push(r.views_at_28d)
      typeBuckets.set(r.episode_type, b)
    }
    if (r.guest_id) {
      const b = guestBuckets.get(r.guest_id) ?? { scores: [], views: [] }
      b.scores.push(r.score)
      if (r.views_at_28d !== null) b.views.push(r.views_at_28d)
      guestBuckets.set(r.guest_id, b)
    }
  }

  function bucketsToInsights(
    map: Map<string, { scores: number[]; views: number[] }>,
    direction: "strong" | "weak",
  ): DimensionInsight[] {
    const out: DimensionInsight[] = []
    for (const [key, b] of map.entries()) {
      if (b.scores.length < MIN_BUCKET_SAMPLE) continue
      const mean = b.scores.reduce((a, x) => a + x, 0) / b.scores.length
      if (direction === "strong" && mean < STRONG_SCORE) continue
      if (direction === "weak" && mean > WEAK_SCORE) continue
      out.push({
        key,
        sample_size: b.scores.length,
        mean_score: Math.round(mean * 1000) / 1000,
        median_views: b.views.length > 0 ? median(b.views) : null,
      })
    }
    return out.sort((a, b) =>
      direction === "strong" ? b.mean_score - a.mean_score : a.mean_score - b.mean_score,
    )
  }

  const strong_topic_domains = bucketsToInsights(domainBuckets, "strong")
  const weak_topic_domains = bucketsToInsights(domainBuckets, "weak")
  const strong_episode_types = bucketsToInsights(typeBuckets, "strong")
  const weak_episode_types = bucketsToInsights(typeBuckets, "weak")
  const strong_guests = bucketsToInsights(guestBuckets, "strong")

  // Recommendations — simple rules-based.
  const recommendations: string[] = []
  if (strong_topic_domains[0]) {
    recommendations.push(
      `أعطِ مجال "${strong_topic_domains[0].key}" وزناً أعلى في الموسم القادم (متوسط ${strong_topic_domains[0].mean_score.toFixed(2)} عبر ${strong_topic_domains[0].sample_size} حلقات).`,
    )
  }
  if (weak_topic_domains[0]) {
    recommendations.push(
      `قلّل وزن "${weak_topic_domains[0].key}" أو غيّر الزاوية (متوسط ${weak_topic_domains[0].mean_score.toFixed(2)}).`,
    )
  }
  if (strong_episode_types[0]) {
    recommendations.push(
      `نوع الحلقة "${strong_episode_types[0].key}" يُحقق أداءً متسقاً.`,
    )
  }
  if (scored.length < MIN_BUCKET_SAMPLE) {
    recommendations.push(
      `العينة صغيرة (${scored.length} حلقات) — التوصيات إرشادية. كرّر بعد ${MIN_BUCKET_SAMPLE - scored.length} حلقات إضافية.`,
    )
  }

  return {
    generated_at: new Date().toISOString(),
    top_episodes,
    weak_episodes,
    strong_topic_domains,
    weak_topic_domains,
    strong_episode_types,
    weak_episode_types,
    strong_guests,
    recommendations,
  }
}

// Suppress unused-import lint.
void desc
void gt
void lt
void lte
