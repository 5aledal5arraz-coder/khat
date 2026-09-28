/**
 * Ordering score for hybrid candidates (constitution, 2026-09-28).
 *
 * The model self-scores the constitution's six dimensions 0–10 (`scores`);
 * this module turns them into ONE number that orders the accepted list, plus
 * the batch-diversity penalties (a repeated lens / archetype sinks a little).
 * It never rejects and it is not a probability — the UI calls it «درجة
 * الترتيب».
 *
 * Retired with the constitution:
 *   - depthScore — "long fields = more thought" measured character count,
 *     not thought;
 *   - STRONG/WEAK_DOMAIN bonuses — the Phase-8 worked-report ranks domains by
 *     VIEWS, and Khat is not views-optimised.
 */

import type { HybridCandidate } from "./reject"
import { SUCCESS_WEIGHTS } from "@/lib/khat-map/v2/success-score"

/** The six constitution dimensions a hybrid topic is self-scored on. */
export const KHAT_TOPIC_SCORE_KEYS = [
  "worth_telling",
  "human_experience",
  "practical_value",
  "segment_fit",
  "library_value",
  "guest_findability",
] as const

export type KhatTopicScoreKey = (typeof KHAT_TOPIC_SCORE_KEYS)[number]
export type KhatTopicScores = Record<KhatTopicScoreKey, number>

export interface ScoringContext {
  /** Lens diversity bias — penalize the 4th, 5th… use of the same lens in one batch. */
  batchLensCounts: Map<string, number>
  /** Archetype (episode-shape) diversity bias — penalize a repeated shape. */
  batchArchetypeCounts?: Map<string, number>
}

const LENS_REPEAT_PENALTY = 0.05
// Archetype repeats bite sooner than lenses (fewer shapes; a repeated shape
// hurts diversity more) — the 3rd use of a shape starts to ding.
const ARCHETYPE_REPEAT_PENALTY = 0.06

/**
 * Coerce the model's `scores` object. Missing / non-numeric → null for the
 * whole object when NO key is usable (the caller then falls back to the
 * legacy self-rating), otherwise each missing key is a neutral 5.
 */
export function clampTopicScores(raw: unknown): KhatTopicScores | null {
  if (!raw || typeof raw !== "object") return null
  const o = raw as Record<string, unknown>
  let usable = 0
  const out = {} as KhatTopicScores
  for (const k of KHAT_TOPIC_SCORE_KEYS) {
    const n = Number(o[k])
    if (o[k] !== null && o[k] !== undefined && o[k] !== "" && Number.isFinite(n)) {
      out[k] = Math.max(0, Math.min(10, n))
      usable++
    } else {
      out[k] = 5
    }
  }
  return usable > 0 ? out : null
}

/** Weighted average of the six dimensions, in [0, 1]. worth_telling weighs most. */
export function khatTopicScore(scores: KhatTopicScores): number {
  let acc = 0
  let sum = 0
  for (const k of KHAT_TOPIC_SCORE_KEYS) {
    const w = SUCCESS_WEIGHTS[k]
    acc += w * scores[k]
    sum += w
  }
  return clamp01(acc / sum / 10)
}

export function rescoreHybridCandidate(
  c: HybridCandidate,
  ctx: ScoringContext,
): number {
  // The constitution's dimensions when the model gave them; the legacy
  // 0..1 self-rating only for a reply that carried none.
  let score = c.scores ? khatTopicScore(c.scores) : clamp01(c.estimated_strength_score ?? 0.5)

  // Lens-diversity penalty (the 4th use of the same lens in one batch
  // gets dinged so the editor sees variety).
  const lensCount = ctx.batchLensCounts.get(c.original_lens) ?? 0
  if (lensCount >= 3) score = clamp01(score - LENS_REPEAT_PENALTY * (lensCount - 2))

  // Archetype-diversity penalty — the 3rd+ use of the same episode SHAPE is
  // dinged so a batch spans shapes, not just subjects.
  if (c.archetype && ctx.batchArchetypeCounts) {
    const archCount = ctx.batchArchetypeCounts.get(c.archetype) ?? 0
    if (archCount >= 2) score = clamp01(score - ARCHETYPE_REPEAT_PENALTY * (archCount - 1))
  }

  return Number(score.toFixed(3))
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0
  return Math.max(0, Math.min(1, v))
}
