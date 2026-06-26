/**
 * Performance → market-source feedback.
 *
 * The third learning loop. When a published episode's editorial_signal_score is
 * computed, we look up the cluster theme that inspired its topic
 * (editorial_intent.primary_theme, stamped at hybrid generation) and nudge the
 * trust_score of the trusted sources behind the approved signals of that theme.
 * A source whose signals keep becoming hits earns trust; one whose signals
 * underperform loses a little. Gentle, capped, and idempotent (one credit per
 * episode, enforced by market_source_feedback_events).
 */

import { and, desc, eq, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { episodeIntelligenceRecords } from "@/lib/db/schema/eir"
import { episodePerformanceSignals } from "@/lib/db/schema/performance-signals"
import { marketTopicSignals } from "@/lib/db/schema/market-intelligence"
import { marketTrustedSources } from "@/lib/db/schema/editorial-intelligence"
import { marketSourceFeedbackEvents } from "@/lib/db/schema/market-source-feedback"
import { adjustTrustScore } from "./sources-mutations"

// "Hit"/"miss" envelope is implicit in the delta curve: scores near 0.5 produce
// a near-zero nudge, strong hits/misses move trust by at most MAX_DELTA.
const MAX_DELTA = 0.03
const SLOPE = 0.06 // delta = (score - 0.5) * SLOPE, clamped to ±MAX_DELTA
const MIN_DELTA = 0.005 // below this magnitude, treat as neutral and skip
const MAX_SOURCES = 5 // credit at most the top-N sources for the theme
const ACTOR = "system:source-feedback"

const clamp01 = (n: number) => Math.max(0, Math.min(1, n))
function computeDelta(score: number): number {
  const d = (score - 0.5) * SLOPE
  return Math.max(-MAX_DELTA, Math.min(MAX_DELTA, d))
}

export interface FeedbackResult {
  credited: boolean
  reason?: "already" | "no_theme" | "no_score" | "neutral" | "no_sources" | "no_db"
  theme?: string
  score?: number
  delta?: number
  sources?: { id: string; before: number; after: number }[]
}

/** Credit (or debit) the sources behind one episode's inspiring theme. Idempotent. */
export async function applySourceFeedbackForEir(
  eirId: string,
  opts?: { dryRun?: boolean },
): Promise<FeedbackResult> {
  if (!db) return { credited: false, reason: "no_db" }
  const dryRun = opts?.dryRun ?? false

  // Idempotency: an EIR is credited at most once.
  const [already] = await db
    .select({ id: marketSourceFeedbackEvents.id })
    .from(marketSourceFeedbackEvents)
    .where(eq(marketSourceFeedbackEvents.eir_id, eirId))
    .limit(1)
  if (already) return { credited: false, reason: "already" }

  const [eir] = await db
    .select({ editorial_intent: episodeIntelligenceRecords.editorial_intent })
    .from(episodeIntelligenceRecords)
    .where(eq(episodeIntelligenceRecords.id, eirId))
    .limit(1)
  const theme = (eir?.editorial_intent as { primary_theme?: string } | null)?.primary_theme
  if (!theme || theme === "none") return { credited: false, reason: "no_theme" }

  const [perf] = await db
    .select({ score: episodePerformanceSignals.editorial_signal_score })
    .from(episodePerformanceSignals)
    .where(eq(episodePerformanceSignals.eir_id, eirId))
    .orderBy(desc(episodePerformanceSignals.calculated_at))
    .limit(1)
  const score = perf?.score
  if (score == null) return { credited: false, reason: "no_score", theme }

  const delta = computeDelta(score)
  if (Math.abs(delta) < MIN_DELTA) return { credited: false, reason: "neutral", theme, score }

  // Sources behind APPROVED signals of this theme, busiest first.
  const sourceRows = await db
    .select({
      id: marketTrustedSources.id,
      trust: marketTrustedSources.trust_score,
      n: sql<number>`count(${marketTopicSignals.id})::int`,
    })
    .from(marketTopicSignals)
    .innerJoin(marketTrustedSources, eq(marketTopicSignals.trusted_source_id, marketTrustedSources.id))
    .where(and(eq(marketTopicSignals.theme, theme), eq(marketTopicSignals.review_status, "approved")))
    .groupBy(marketTrustedSources.id, marketTrustedSources.trust_score)
    .orderBy(desc(sql`count(${marketTopicSignals.id})`))
    .limit(MAX_SOURCES)

  if (sourceRows.length === 0) return { credited: false, reason: "no_sources", theme, score }

  const applied: { id: string; before: number; after: number }[] = []
  for (const s of sourceRows) {
    const before = s.trust ?? 0.5
    const after = clamp01(before + delta)
    if (!dryRun) {
      await adjustTrustScore(s.id, after, { actorId: ACTOR })
      await db.insert(marketSourceFeedbackEvents).values({
        eir_id: eirId,
        source_id: s.id,
        theme,
        signal_score: score,
        trust_before: before,
        trust_after: after,
      })
    }
    applied.push({ id: s.id, before, after })
  }

  return { credited: !dryRun, theme, score, delta, sources: applied }
}

/**
 * Batch pass — credit every published EIR that has a performance score and a
 * theme but hasn't been credited yet. For the scheduled worker + backfill.
 */
export async function backfillSourceFeedback(opts?: {
  limit?: number
  dryRun?: boolean
}): Promise<{ scanned: number; credited: number }> {
  if (!db) return { scanned: 0, credited: 0 }
  const limit = opts?.limit ?? 200

  // EIRs with a computed score and no feedback event yet.
  const rows = await db
    .select({ eir_id: episodePerformanceSignals.eir_id })
    .from(episodePerformanceSignals)
    .leftJoin(marketSourceFeedbackEvents, eq(marketSourceFeedbackEvents.eir_id, episodePerformanceSignals.eir_id))
    .where(and(sql`${episodePerformanceSignals.editorial_signal_score} is not null`, sql`${marketSourceFeedbackEvents.id} is null`))
    .limit(limit)

  const seen = new Set<string>()
  let credited = 0
  for (const r of rows) {
    if (seen.has(r.eir_id)) continue
    seen.add(r.eir_id)
    const res = await applySourceFeedbackForEir(r.eir_id, { dryRun: opts?.dryRun })
    if (res.credited) credited++
  }
  return { scanned: seen.size, credited }
}
