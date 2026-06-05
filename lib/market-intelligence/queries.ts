/**
 * Phase X Step 1 — read service for the Command Center + Hybrid
 * generator (Step 3 will consume these).
 *
 * Every public function returns a stable shape; do not surface drizzle
 * row types so the UI can stay decoupled.
 */

import { sql, desc } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  marketTopicSignals,
  marketTopicClusters,
} from "@/lib/db/schema/market-intelligence"

export interface MarketTotals {
  signals_total: number
  signals_last_7d: number
  clusters_total: number
}

export interface TopClusterSummary {
  label: string
  language: string
  signal_count: number
  dominant_emotions: string[]
  median_view_signal: number | null
  source_breakdown: Record<string, number>
  narrative_hooks: string[]
}

export interface EmotionalTriggerSummary {
  trigger: string
  count: number
}

export interface NarrativeHookSummary {
  label: string
  language: string
  hook: string
}

export async function getMarketTotals(): Promise<MarketTotals> {
  const since = new Date(Date.now() - 7 * 86400_000)
  const [signalsTotal, signalsRecent, clustersTotal] = await Promise.all([
    db!.execute(sql`SELECT COUNT(*)::int AS c FROM market_topic_signals`),
    db!.execute(
      sql`SELECT COUNT(*)::int AS c FROM market_topic_signals WHERE collected_at >= ${since}`,
    ),
    db!.execute(sql`SELECT COUNT(*)::int AS c FROM market_topic_clusters`),
  ])
  return {
    signals_total: numberFromCount(signalsTotal),
    signals_last_7d: numberFromCount(signalsRecent),
    clusters_total: numberFromCount(clustersTotal),
  }
}

export async function getTopClusters(limit = 10): Promise<TopClusterSummary[]> {
  // Phase 6: editorial_score (sum of per-signal contribution weights)
  // is the primary sort key — clusters built on reviewed/approved/
  // operator-created/trusted signals lead. Raw signal_count is the
  // secondary tiebreaker; clusters from older days without scores still
  // show up but rank lower than freshly editorial-weighted ones.
  const rows = await db!
    .select()
    .from(marketTopicClusters)
    .orderBy(
      desc(marketTopicClusters.editorial_score),
      desc(marketTopicClusters.signal_count),
    )
    .limit(limit)
  return rows.map((r) => ({
    label: r.label,
    language: r.language,
    signal_count: r.signal_count,
    dominant_emotions: (r.dominant_emotions as string[] | null) ?? [],
    median_view_signal:
      r.median_view_signal === null ? null : Number(r.median_view_signal),
    source_breakdown:
      (r.source_breakdown as Record<string, number> | null) ?? {},
    narrative_hooks: (r.narrative_hooks as string[] | null) ?? [],
  }))
}

export async function getEmotionalTriggers(
  limit = 10,
): Promise<EmotionalTriggerSummary[]> {
  const r = await db!.execute(sql`
    SELECT emotional_trigger AS trigger, COUNT(*)::int AS count
    FROM market_topic_signals
    WHERE emotional_trigger IS NOT NULL AND emotional_trigger <> 'none'
    GROUP BY emotional_trigger
    ORDER BY count DESC
    LIMIT ${limit}
  `)
  return (r.rows as Array<{ trigger: string; count: number }>).map((row) => ({
    trigger: row.trigger,
    count: Number(row.count),
  }))
}

export async function getNarrativeHooks(
  limit = 10,
): Promise<NarrativeHookSummary[]> {
  const rows = await db!
    .select()
    .from(marketTopicClusters)
    .orderBy(desc(marketTopicClusters.signal_count))
    .limit(limit)
  const out: NarrativeHookSummary[] = []
  for (const r of rows) {
    const hooks = (r.narrative_hooks as string[] | null) ?? []
    if (hooks[0]) {
      out.push({ label: r.label, language: r.language, hook: hooks[0] })
    }
  }
  return out
}

export async function getSourceBreakdown(): Promise<Record<string, number>> {
  const r = await db!.execute(sql`
    SELECT source, COUNT(*)::int AS count
    FROM market_topic_signals
    GROUP BY source
  `)
  const out: Record<string, number> = {}
  for (const row of r.rows as Array<{ source: string; count: number }>) {
    out[row.source] = Number(row.count)
  }
  return out
}

void marketTopicSignals

function numberFromCount(
  result: { rows: Array<{ c: number | string }> } | unknown,
): number {
  const rows = (result as { rows: Array<{ c: number | string }> }).rows
  if (!rows[0]) return 0
  return Number(rows[0].c) || 0
}
