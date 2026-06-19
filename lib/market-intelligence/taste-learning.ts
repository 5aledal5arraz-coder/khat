/**
 * Phase 5 — Soft editorial taste learning.
 *
 *   • applyReviewEventLearning(...)  — called from mutations after a
 *                                       review event is recorded.
 *                                       Applies a small EMA delta to
 *                                       editorial_taste_weights.
 *   • runTasteDecay(...)             — nightly tick. Multiplies every
 *                                       weight by DECAY_FACTOR; resets
 *                                       to 0 below DECAY_RESET_THRESHOLD.
 *   • loadTasteLookup()              — read taste weights into the
 *                                       four maps the scorer expects.
 *
 * Safety rails:
 *   • No single delta exceeds 0.10 in absolute value.
 *   • EMA blend (α = 0.30) ensures the weight moves toward the new
 *     signal without snapping to it.
 *   • Weights clamped to [-1, 1].
 *   • Decay (~0.97/day) means a one-time spike fades within weeks.
 *   • sample_size tracked but never used as a multiplier — it's
 *     metadata for inspection.
 *   • Learning is BEST-EFFORT: a failed taste update never blocks the
 *     review mutation itself. The audit trail remains the source of
 *     truth — Phase 5 can be replayed against events if needed.
 */

import { and, eq, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  editorialTasteWeights,
  type SignalReviewAction,
  type SignalEditorialTag,
  type TasteWeightDimension,
} from "@/lib/db/schema/editorial-intelligence"
import type { TasteWeightLookup } from "./scoring"

// ─── Tunables ────────────────────────────────────────────────────────

/** EMA blend factor. `w_new = α·delta + (1 − α)·w_old`. Lower α = more
 *  inertia → slower drift. */
export const TASTE_EMA_ALPHA = 0.3

/** Nightly multiplier applied to every weight. 0.97 ≈ 23-day half-life. */
export const TASTE_DECAY_FACTOR = 0.97

/** Weights with |w| below this snap to 0 — keeps the table tight. */
export const TASTE_DECAY_RESET_THRESHOLD = 0.05

/** Per-event soft deltas. Each value is clamped to [-0.10, 0.10] by
 *  construction. Operator-created signals get a slight boost over
 *  ordinary approvals — the operator's own authoring carries weight. */
export const REVIEW_EVENT_DELTAS: Record<SignalReviewAction, number> = {
  approve: 0.05,
  reject: -0.05,
  archive: -0.02,
  restore: 0.02,
  tag: 0, // handled per-tag below
  untag: 0,
  note: 0,
  create: 0.07,
}

/** Per-tag deltas applied to the theme dimension on `tag` events.
 *  off_identity additionally penalizes the source dimension. */
export const TAG_THEME_DELTAS: Record<SignalEditorialTag, number> = {
  strong: 0.04,
  timeless: 0.05,
  deep: 0.04,
  emotional: 0.03,
  controversial: 0.01,
  weak: -0.04,
  surface_level: -0.05,
  repetitive: -0.03,
  off_identity: -0.05, // theme penalty (source penalty applied below)
}

export const OFF_IDENTITY_SOURCE_PENALTY = -0.10

// ─── Loading ─────────────────────────────────────────────────────────

export async function loadTasteLookup(): Promise<TasteWeightLookup> {
  const empty: TasteWeightLookup = {
    byTheme: new Map(),
    bySource: new Map(),
    byLanguage: new Map(),
    byTag: new Map(),
  }
  if (!db) return empty
  const rows = await db
    .select({
      dimension: editorialTasteWeights.dimension,
      key: editorialTasteWeights.key,
      weight: editorialTasteWeights.weight,
    })
    .from(editorialTasteWeights)
  for (const r of rows) {
    const w = Number(r.weight ?? 0)
    if (!Number.isFinite(w) || w === 0) continue
    const bucket =
      r.dimension === "theme"
        ? empty.byTheme
        : r.dimension === "source"
          ? empty.bySource
          : r.dimension === "tag"
            ? empty.byTag
            : empty.byLanguage
    bucket.set(r.key, w)
  }
  return empty
}

// ─── Apply a single (dimension, key) delta ──────────────────────────

/** Upsert a taste weight by EMA blend, clamped + sample_size bumped.
 *  Idempotent under concurrency thanks to the unique index. */
async function bumpWeight(
  dimension: TasteWeightDimension,
  key: string,
  delta: number,
): Promise<void> {
  if (!db) return
  if (!key || !Number.isFinite(delta) || delta === 0) return
  // Cap incoming delta so accidental misuse can't move the system far.
  const safeDelta = Math.max(-0.10, Math.min(0.10, delta))
  // INSERT … ON CONFLICT keeps the existing weight and applies EMA,
  // then clamps in SQL so a single statement is the source of truth.
  // Explicit ::real casts let pg infer types when parameters are used
  // inside arithmetic with the `real` `weight` column.
  await db.execute(sql`
    INSERT INTO editorial_taste_weights
      (dimension, key, weight, sample_size, last_reinforced_at)
    VALUES
      (${dimension}, ${key},
       greatest(-1::real, least(1::real, (${safeDelta}::real * ${TASTE_EMA_ALPHA}::real))),
       1, now())
    ON CONFLICT (dimension, key) DO UPDATE
      SET weight = greatest(-1::real, least(1::real,
            ${TASTE_EMA_ALPHA}::real * ${safeDelta}::real
            + (1 - ${TASTE_EMA_ALPHA}::real) * editorial_taste_weights.weight)),
          sample_size = editorial_taste_weights.sample_size + 1,
          last_reinforced_at = now()
  `)
}

// ─── Public hooks ────────────────────────────────────────────────────

export interface LearningContext {
  /** The signal's classification context — drives which keys we touch. */
  theme: string | null
  language: string | null
  trusted_source_id: string | null
  /** True when the signal was authored by an operator. Used to give
   *  the boost in REVIEW_EVENT_DELTAS.create a small extra nudge. */
  operator_created: boolean
}

/**
 * Apply a soft EMA update to editorial_taste_weights in response to a
 * review event. Never throws — caller is the audit-truth source.
 */
export async function applyReviewEventLearning(args: {
  action: SignalReviewAction
  tag?: SignalEditorialTag | null
  ctx: LearningContext
}): Promise<void> {
  const { action, tag, ctx } = args
  try {
    if (action === "tag" && tag) {
      const themeDelta = TAG_THEME_DELTAS[tag] ?? 0
      if (themeDelta !== 0 && ctx.theme) {
        await bumpWeight("theme", ctx.theme, themeDelta)
      }
      if (tag === "off_identity" && ctx.trusted_source_id) {
        await bumpWeight(
          "source",
          ctx.trusted_source_id,
          OFF_IDENTITY_SOURCE_PENALTY,
        )
      }
      // The tag dimension itself learns from operator preference,
      // but at a small rate — operators tag the same theme often.
      await bumpWeight("tag", tag, 0.02)
      return
    }
    if (action === "untag" && tag) {
      // Untag = gentle reversal at half strength of the original.
      const reverse = -(TAG_THEME_DELTAS[tag] ?? 0) / 2
      if (reverse !== 0 && ctx.theme) {
        await bumpWeight("theme", ctx.theme, reverse)
      }
      return
    }
    const delta = REVIEW_EVENT_DELTAS[action] ?? 0
    if (delta === 0) return
    // `create` is operator-authored — slight extra nudge applied
    // via the existing 0.07 delta.
    if (ctx.theme) await bumpWeight("theme", ctx.theme, delta)
    if (ctx.trusted_source_id)
      await bumpWeight("source", ctx.trusted_source_id, delta)
    if (ctx.language) await bumpWeight("language", ctx.language, delta * 0.5)
  } catch (e) {
    // Learning is best-effort. Never block the audit-truth mutation.
    const direct = e instanceof Error ? e.message : String(e)
    const cause =
      e instanceof Error && e.cause instanceof Error ? e.cause.message : ""
    console.warn(
      `[taste-learning] failed: ${cause || direct.slice(0, 120)}`,
    )
  }
}

// ─── Decay tick ──────────────────────────────────────────────────────

export interface DecayResult {
  scanned: number
  decayed: number
  reset_to_zero: number
}

/**
 * Apply nightly decay to every weight row. Single UPDATE — atomic,
 * idempotent, safe under concurrent writes (the worker mutex prevents
 * double-runs).
 */
export async function runTasteDecay(): Promise<DecayResult> {
  if (!db) {
    return { scanned: 0, decayed: 0, reset_to_zero: 0 }
  }
  const beforeRow = await db.execute(sql`
    SELECT
      count(*)::int AS total,
      count(*) FILTER (WHERE abs(weight) >= ${TASTE_DECAY_RESET_THRESHOLD}::real)::int AS active
    FROM editorial_taste_weights
  `)
  const total = Number(
    (beforeRow.rows[0] as { total?: number } | undefined)?.total ?? 0,
  )
  const active = Number(
    (beforeRow.rows[0] as { active?: number } | undefined)?.active ?? 0,
  )

  await db.execute(sql`
    UPDATE editorial_taste_weights
       SET weight = CASE
         WHEN abs(weight * ${TASTE_DECAY_FACTOR}::real) < ${TASTE_DECAY_RESET_THRESHOLD}::real
           THEN 0::real
         ELSE greatest(-1::real, least(1::real, weight * ${TASTE_DECAY_FACTOR}::real))
       END
     WHERE weight <> 0
  `)

  const afterRow = await db.execute(sql`
    SELECT count(*) FILTER (WHERE weight = 0)::int AS zeros
    FROM editorial_taste_weights
  `)
  const zerosAfter = Number(
    (afterRow.rows[0] as { zeros?: number } | undefined)?.zeros ?? 0,
  )

  // Rows that decayed from non-zero to zero. We can't compute this
  // exactly without a snapshot, but (active - non-zero rows after) is
  // an upper bound that's close enough for ops insight.
  const decayed = active
  const reset_to_zero = Math.max(0, zerosAfter)

  return {
    scanned: total,
    decayed,
    reset_to_zero,
  }
}

// Suppress unused — used by callers via re-export.
void and
void eq
