/**
 * Hybrid Topics — Readiness diagnostics.
 *
 * Single source of truth for "can the hybrid generator run right now,
 * and if not, why not". Used by:
 *   • the dev-only diagnostics panel on the season workspace
 *   • the hybrid server action (auto-trigger missing pipeline stages
 *     before delegating to the generator)
 *   • the smoke test
 *
 * Pure read — no side effects. The action layer decides whether to
 * enqueue follow-up jobs based on this snapshot.
 */

import { sql } from "drizzle-orm"
import { db } from "@/lib/db"

export interface HybridReadiness {
  // Raw layer counts
  market_signals_total: number
  market_signals_extracted: number
  market_signals_unextracted: number
  market_signals_scored: number
  market_clusters_total: number
  original_topics_fresh: number
  worked_strong_domains: number
  worked_weak_domains: number

  // Derived gates
  has_clusters: boolean
  has_recent_signals: boolean
  has_scored_signals: boolean
  has_originals: boolean
  has_memory: boolean

  /** Bottom line. Phase 6: signals alone do NOT make the generator
   *  ready — only clusters + foundational sources do. */
  generator_ready: boolean
  /** Internal reason code. null when ready.
   *    no_inputs        — truly empty system
   *    analysis_pending — signals exist but clusters lag (auto-pipeline
   *                       will catch up). UI should surface
   *                       "جاري تحليل إشارات السوق…". */
  blocking_reason: "no_inputs" | "analysis_pending" | null

  // Pipeline self-heal recommendations
  should_trigger_extraction: boolean
  should_trigger_scoring: boolean
  should_trigger_clustering: boolean

  // In-flight job awareness (so we don't double-enqueue)
  inflight: {
    collect: boolean
    extract: boolean
    score: boolean
    cluster: boolean
  }
}

export async function getHybridReadiness(): Promise<HybridReadiness> {
  if (!db) {
    return emptyReadiness()
  }

  const [
    signalsRow,
    clustersRow,
    originalsRow,
    workedRow,
    inflightRow,
  ] = await Promise.all([
    db.execute(sql`
      SELECT
        count(*)::int AS total,
        count(*) FILTER (WHERE theme IS NOT NULL)::int AS extracted,
        count(*) FILTER (WHERE signal_score IS NOT NULL)::int AS scored
      FROM market_topic_signals
      WHERE review_status NOT IN ('rejected', 'archived')
    `),
    db.execute(sql`SELECT count(*)::int AS n FROM market_topic_clusters`),
    db.execute(sql`
      SELECT count(*)::int AS n
      FROM original_thinking_topics
      WHERE consumed_at IS NULL AND expires_at > now()
    `),
    db.execute(sql`
      SELECT
        count(*) FILTER (WHERE editorial_signal_score >= 0.6)::int AS strong,
        count(*) FILTER (WHERE editorial_signal_score < 0.4)::int  AS weak
      FROM episode_performance_signals
    `),
    db.execute(sql`
      SELECT
        count(*) FILTER (WHERE type = 'market.collect')::int         AS collect,
        count(*) FILTER (WHERE type = 'market.extract')::int         AS extract,
        count(*) FILTER (WHERE type = 'market.score_signals')::int   AS score,
        count(*) FILTER (WHERE type = 'market.cluster_signals')::int AS cluster
      FROM jobs
      WHERE status IN ('pending', 'running')
    `),
  ])

  const total = num(signalsRow.rows[0], "total")
  const extracted = num(signalsRow.rows[0], "extracted")
  const scored = num(signalsRow.rows[0], "scored")
  const clusters = num(clustersRow.rows[0], "n")
  const originals = num(originalsRow.rows[0], "n")
  const strong = num(workedRow.rows[0], "strong")
  const weak = num(workedRow.rows[0], "weak")

  const inflight = {
    collect: num(inflightRow.rows[0], "collect") > 0,
    extract: num(inflightRow.rows[0], "extract") > 0,
    score: num(inflightRow.rows[0], "score") > 0,
    cluster: num(inflightRow.rows[0], "cluster") > 0,
  }

  const has_clusters = clusters > 0
  const has_recent_signals = total > 0
  const has_scored_signals = scored > 0
  const has_originals = originals > 0
  const has_memory = strong + weak > 0

  // Phase 6 readiness: raw signals alone are NOT enough — clusters or
  // foundational sources (originals/memory) must exist. When signals
  // exist but clusters don't, that's `analysis_pending`, not ready.
  const has_foundational = has_originals || has_memory
  const generator_ready = has_clusters || has_foundational

  let blocking_reason: HybridReadiness["blocking_reason"] = null
  if (!generator_ready) {
    blocking_reason = has_recent_signals ? "analysis_pending" : "no_inputs"
  }

  // Self-heal recommendations.
  const should_trigger_extraction = total - extracted > 0 && !inflight.extract
  const should_trigger_scoring =
    extracted > 0 && extracted - scored > 0 && !inflight.score
  const should_trigger_clustering =
    extracted >= 2 && clusters === 0 && !inflight.cluster

  return {
    market_signals_total: total,
    market_signals_extracted: extracted,
    market_signals_unextracted: total - extracted,
    market_signals_scored: scored,
    market_clusters_total: clusters,
    original_topics_fresh: originals,
    worked_strong_domains: strong,
    worked_weak_domains: weak,
    has_clusters,
    has_recent_signals,
    has_scored_signals,
    has_originals,
    has_memory,
    generator_ready,
    blocking_reason,
    should_trigger_extraction,
    should_trigger_scoring,
    should_trigger_clustering,
    inflight,
  }
}

function num(row: Record<string, unknown> | undefined, key: string): number {
  if (!row) return 0
  const v = row[key]
  return typeof v === "number" ? v : Number(v) || 0
}

function emptyReadiness(): HybridReadiness {
  return {
    market_signals_total: 0,
    market_signals_extracted: 0,
    market_signals_unextracted: 0,
    market_signals_scored: 0,
    market_clusters_total: 0,
    original_topics_fresh: 0,
    worked_strong_domains: 0,
    worked_weak_domains: 0,
    has_clusters: false,
    has_recent_signals: false,
    has_scored_signals: false,
    has_originals: false,
    has_memory: false,
    generator_ready: false,
    blocking_reason: "no_inputs",
    should_trigger_extraction: false,
    should_trigger_scoring: false,
    should_trigger_clustering: false,
    inflight: { collect: false, extract: false, score: false, cluster: false },
  }
}
