/**
 * Phase 5 — Market signal scoring + taste decay job handlers.
 *
 *   market.score_signals  — recompute signal_score + score_components
 *                            for every signal (or just stale ones).
 *                            Auto-chained from market.extract.
 *   market.taste_decay    — nightly decay tick on editorial_taste_weights.
 *                            Scheduled by market.scheduler.
 *
 * Idempotent — both handlers are safe to run multiple times. The
 * scorer reads the live `editorial_taste_weights` table on each run
 * so it always reflects the latest taste, not a stale snapshot.
 */

import { sql, isNull, or, lt } from "drizzle-orm"
import { db } from "@/lib/db"
import { registerHandler } from "../registry"
import {
  marketTopicSignals,
  marketTrustedSources,
} from "@/lib/db/schema"
import {
  scoreSignal,
  type ScoredSignal,
  type ScoringSignalInput,
} from "@/lib/market-intelligence/scoring"
import {
  loadTasteLookup,
  runTasteDecay,
  type DecayResult,
} from "@/lib/market-intelligence/taste-learning"
import { eq } from "drizzle-orm"

// ─── market.score_signals ────────────────────────────────────────────

interface ScorePayload extends Record<string, unknown> {
  /** When set, score every signal (not just those with NULL/stale
   *  signal_score). Manual "تحديث تقييم الإشارات" runs use this. */
  fullRescore?: boolean
  /** Override scan cap. Default 1000 per run. */
  limit?: number
  /** Recompute signals whose signal_score is older than this. Default 7d. */
  staleAfterHours?: number
  /** Whether this run was kicked off by the scheduler chain. */
  scheduled?: boolean
}

interface ScoreResult extends Record<string, unknown> {
  scanned: number
  written: number
  skipped: number
}

registerHandler<ScorePayload, ScoreResult>(
  "market.score_signals",
  async (payload) => {
    if (!db) return { scanned: 0, written: 0, skipped: 0 }

    const limit = payload.limit ?? 1000
    const staleAfterHours = payload.staleAfterHours ?? 24 * 7

    // Load taste lookup once for the batch.
    const taste = await loadTasteLookup()

    // Pull candidate signals + trusted-source join for trust/alignment.
    const rows = payload.fullRescore
      ? await db
          .select({
            id: marketTopicSignals.id,
            collected_at: marketTopicSignals.collected_at,
            review_status: marketTopicSignals.review_status,
            editorial_tags: marketTopicSignals.editorial_tags,
            operator_created: marketTopicSignals.operator_created,
            view_signal: marketTopicSignals.view_signal,
            controversy_score: marketTopicSignals.controversy_score,
            theme: marketTopicSignals.theme,
            language: marketTopicSignals.language,
            trusted_source_id: marketTopicSignals.trusted_source_id,
            trust_score: marketTrustedSources.trust_score,
            editorial_alignment_score:
              marketTrustedSources.editorial_alignment_score,
          })
          .from(marketTopicSignals)
          .leftJoin(
            marketTrustedSources,
            eq(marketTrustedSources.id, marketTopicSignals.trusted_source_id),
          )
          .limit(limit)
      : await db
          .select({
            id: marketTopicSignals.id,
            collected_at: marketTopicSignals.collected_at,
            review_status: marketTopicSignals.review_status,
            editorial_tags: marketTopicSignals.editorial_tags,
            operator_created: marketTopicSignals.operator_created,
            view_signal: marketTopicSignals.view_signal,
            controversy_score: marketTopicSignals.controversy_score,
            theme: marketTopicSignals.theme,
            language: marketTopicSignals.language,
            trusted_source_id: marketTopicSignals.trusted_source_id,
            trust_score: marketTrustedSources.trust_score,
            editorial_alignment_score:
              marketTrustedSources.editorial_alignment_score,
          })
          .from(marketTopicSignals)
          .leftJoin(
            marketTrustedSources,
            eq(marketTrustedSources.id, marketTopicSignals.trusted_source_id),
          )
          .where(
            or(
              isNull(marketTopicSignals.signal_score),
              lt(
                sql`coalesce(${marketTopicSignals.reviewed_at}, ${marketTopicSignals.collected_at})`,
                sql`now() - (${staleAfterHours} || ' hours')::interval`,
              ),
            ),
          )
          .limit(limit)

    let written = 0
    let skipped = 0
    for (const r of rows) {
      try {
        const input: ScoringSignalInput = {
          id: r.id,
          collected_at:
            r.collected_at instanceof Date
              ? r.collected_at.toISOString()
              : String(r.collected_at),
          review_status:
            (r.review_status as ScoringSignalInput["review_status"]) ?? "new",
          editorial_tags: Array.isArray(r.editorial_tags)
            ? (r.editorial_tags as string[])
            : [],
          operator_created: r.operator_created === true,
          view_signal:
            r.view_signal === null || r.view_signal === undefined
              ? null
              : Number(r.view_signal),
          controversy_score:
            r.controversy_score === null || r.controversy_score === undefined
              ? null
              : Number(r.controversy_score),
          theme: (r.theme as string | null) ?? null,
          language: String(r.language ?? "ar"),
          trusted_source_trust:
            r.trust_score === null || r.trust_score === undefined
              ? null
              : Number(r.trust_score),
          trusted_source_alignment:
            r.editorial_alignment_score === null ||
            r.editorial_alignment_score === undefined
              ? null
              : Number(r.editorial_alignment_score),
          trusted_source_id: (r.trusted_source_id as string | null) ?? null,
        }
        const scored: ScoredSignal = scoreSignal(input, taste)
        await db
          .update(marketTopicSignals)
          .set({
            signal_score: scored.signal_score,
            score_components: scored.score_components as unknown as Record<
              string,
              number
            >,
          })
          .where(eq(marketTopicSignals.id, scored.id))
        written += 1
      } catch (e) {
        skipped += 1
        const msg = e instanceof Error ? e.message : String(e)
        console.warn(`[market.score_signals] skipped ${r.id}:`, msg)
      }
    }

    return {
      scanned: rows.length,
      written,
      skipped,
    }
  },
)

// ─── market.taste_decay ──────────────────────────────────────────────

interface DecayPayload extends Record<string, unknown> {
  scheduled?: boolean
}

registerHandler<DecayPayload, DecayResult>(
  "market.taste_decay",
  async () => {
    return await runTasteDecay()
  },
)
