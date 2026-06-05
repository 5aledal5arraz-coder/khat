/**
 * Phase 5 — Signal scoring.
 *
 * Computes signal_score ∈ [0, 1] from soft-weighted factors. Stored
 * alongside score_components (JSONB) for explainability. The scorer is
 * intentionally conservative — no single dimension can dominate, and
 * controversy is capped so we don't drift toward trend-chasing.
 *
 * Formula:
 *
 *   signal_score = clamp01(
 *       0.15 · source_trust          (from trusted_sources.trust_score)
 *     + 0.15 · editorial_alignment   (from trusted_sources.editorial_alignment_score)
 *     + 0.15 · review_status_factor  (approved → +1, archived → 0, rejected → −1)
 *     + 0.10 · operator_created      (1 if operator-authored, else 0)
 *     + 0.10 · recency_factor        (exp(−Δt / half_life), half_life = 30d)
 *     + 0.10 · popularity_factor     (log-normalized view_signal; 0 when missing)
 *     + 0.05 · controversy_factor    (capped — never the deciding factor)
 *     + 0.15 · taste_match           (dot-product with editorial_taste_weights;
 *                                      theme + source + language dimensions)
 *     +        tag_adjust            (per-tag soft additions, see TAG_DELTAS)
 *   )
 *
 * Weights sum to 0.95 nominal; tag_adjust can shift further. Final
 * value clamped to [0, 1]. score_components is the raw per-term
 * contribution before the global clamp.
 *
 * Phase 5 contract: clustering does NOT yet read signal_score (that's
 * Phase 6). This module only writes signal_score / score_components.
 * Hybrid generation is untouched.
 */

import type { SignalEditorialTag } from "@/lib/db/schema/editorial-intelligence"

// ─── Tunables ────────────────────────────────────────────────────────

export const SCORE_WEIGHTS = {
  source_trust: 0.15,
  editorial_alignment: 0.15,
  review_status: 0.15,
  operator_created: 0.10,
  recency: 0.10,
  popularity: 0.10,
  controversy: 0.05,
  taste_match: 0.15,
} as const

export const RECENCY_HALF_LIFE_DAYS = 30
export const POPULARITY_LOG_BASE = 100_000 // 100k views → 1.0 on the curve

/** Per-tag additive deltas. Positive lifts the score; negative dampens
 *  it. Kept small so a single tag can't dominate the others. */
export const TAG_DELTAS: Record<SignalEditorialTag, number> = {
  strong: 0.04,
  timeless: 0.05,
  deep: 0.04,
  emotional: 0.03,
  controversial: 0.01, // gently positive — controversy matters but not much
  weak: -0.06,
  surface_level: -0.07,
  repetitive: -0.04,
  off_identity: -0.12, // hardest soft penalty: identity-violating tag
}

// ─── Input shapes ────────────────────────────────────────────────────

export interface ScoringSignalInput {
  /** Row id — for batch returns + audit. */
  id: string
  /** ISO timestamp of ingestion. */
  collected_at: string
  /** Phase 1 review state. */
  review_status: "new" | "approved" | "rejected" | "archived"
  /** Phase 1 multi-tag annotations. */
  editorial_tags: string[]
  /** True when authored by an operator via the manual form. */
  operator_created: boolean
  /** YouTube-style view count when available. */
  view_signal: number | null
  /** AI/operator-supplied controversy estimate, [0, 1]. */
  controversy_score: number | null
  /** Theme key — used to look up taste weight. */
  theme: string | null
  /** Language — used as a second taste dimension. */
  language: string
  /** When the signal is linked to a trusted source, its trust + alignment. */
  trusted_source_trust: number | null
  trusted_source_alignment: number | null
  /** trusted_source_id — looked up in taste weights with dimension='source'. */
  trusted_source_id: string | null
}

/** Subset of editorial_taste_weights the scorer needs to consult. */
export interface TasteWeightLookup {
  byTheme: Map<string, number>
  bySource: Map<string, number>
  byLanguage: Map<string, number>
  byTag: Map<string, number>
}

export interface ScoreComponents {
  source_trust: number
  editorial_alignment: number
  review_status: number
  operator_created: number
  recency: number
  popularity: number
  controversy: number
  taste_match: number
  tag_adjust: number
}

export interface ScoredSignal {
  id: string
  signal_score: number
  score_components: ScoreComponents
}

// ─── Pure math ───────────────────────────────────────────────────────

export function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0
  if (n < 0) return 0
  if (n > 1) return 1
  return n
}

export function clampWeight(n: number): number {
  if (!Number.isFinite(n)) return 0
  if (n < -1) return -1
  if (n > 1) return 1
  return n
}

function recencyFactor(collected_at: string, now: number = Date.now()): number {
  const t = new Date(collected_at).getTime()
  if (!Number.isFinite(t) || t > now) return 1
  const ageDays = (now - t) / 86_400_000
  // Exponential decay with half-life = RECENCY_HALF_LIFE_DAYS.
  return Math.pow(0.5, ageDays / RECENCY_HALF_LIFE_DAYS)
}

function popularityFactor(view_signal: number | null): number {
  if (view_signal === null || view_signal === undefined) return 0
  if (view_signal <= 0) return 0
  // log-scaled: views=POPULARITY_LOG_BASE → 1.0, lower scales down.
  const v = Math.log10(view_signal + 1) / Math.log10(POPULARITY_LOG_BASE)
  return clamp01(v)
}

function reviewStatusFactor(status: ScoringSignalInput["review_status"]): number {
  switch (status) {
    case "approved":
      return 1
    case "new":
      return 0.3 // small positive prior — pending review is neutral-ish
    case "archived":
      return 0
    case "rejected":
      return -1
  }
}

function tasteMatch(s: ScoringSignalInput, weights: TasteWeightLookup): number {
  let sum = 0
  let n = 0
  if (s.theme) {
    sum += weights.byTheme.get(s.theme) ?? 0
    n += 1
  }
  if (s.trusted_source_id) {
    sum += weights.bySource.get(s.trusted_source_id) ?? 0
    n += 1
  }
  if (s.language) {
    sum += weights.byLanguage.get(s.language) ?? 0
    n += 1
  }
  return n === 0 ? 0 : sum / n
}

function tagAdjust(tags: string[], weights: TasteWeightLookup): number {
  let adjust = 0
  for (const t of tags) {
    const delta = TAG_DELTAS[t as SignalEditorialTag]
    if (typeof delta === "number") adjust += delta
    // Soft pull toward whatever the operator has historically liked
    // about THIS tag — small influence so a fresh weight can't swing
    // the whole score.
    adjust += (weights.byTag.get(t) ?? 0) * 0.05
  }
  return adjust
}

// ─── Public API ──────────────────────────────────────────────────────

/**
 * Score one signal. Returns the components for audit + the clamped
 * score. Caller persists both columns.
 */
export function scoreSignal(
  s: ScoringSignalInput,
  weights: TasteWeightLookup,
): ScoredSignal {
  const components: ScoreComponents = {
    source_trust:
      (s.trusted_source_trust ?? 0) * SCORE_WEIGHTS.source_trust,
    editorial_alignment:
      (s.trusted_source_alignment ?? 0) * SCORE_WEIGHTS.editorial_alignment,
    review_status:
      reviewStatusFactor(s.review_status) * SCORE_WEIGHTS.review_status,
    operator_created:
      (s.operator_created ? 1 : 0) * SCORE_WEIGHTS.operator_created,
    recency: recencyFactor(s.collected_at) * SCORE_WEIGHTS.recency,
    popularity: popularityFactor(s.view_signal) * SCORE_WEIGHTS.popularity,
    // Controversy is multiplied by its weight AND its own value (so a
    // 0.4 controversy yields 0.4 * 0.05 = 0.02 — capped + gentle).
    controversy: (s.controversy_score ?? 0) * SCORE_WEIGHTS.controversy,
    taste_match: tasteMatch(s, weights) * SCORE_WEIGHTS.taste_match,
    tag_adjust: tagAdjust(s.editorial_tags ?? [], weights),
  }
  const total =
    components.source_trust +
    components.editorial_alignment +
    components.review_status +
    components.operator_created +
    components.recency +
    components.popularity +
    components.controversy +
    components.taste_match +
    components.tag_adjust
  return {
    id: s.id,
    signal_score: clamp01(total),
    score_components: components,
  }
}

/** Convenience for scoring many signals against the same taste lookup. */
export function scoreBatch(
  signals: ScoringSignalInput[],
  weights: TasteWeightLookup,
): ScoredSignal[] {
  return signals.map((s) => scoreSignal(s, weights))
}
