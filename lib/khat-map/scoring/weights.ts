/**
 * Khat Map — centralized scoring weights.
 *
 * One file, one source of truth. Every multiplier and threshold the v2
 * batch engine uses lives here. Changing a number in this file is the
 * intended way to retune ranking — code in v2/scoring.ts and v2/batch-engine.ts
 * imports these constants and never hard-codes them.
 *
 * Each section documents the SHAPE the value must respect (range, units,
 * sum) so future tuners don't accidentally break the composite balance.
 */

import type {
  KhatMapDomainWeight,
  KhatMapTopicQuality,
  KhatMapGuestQuality,
} from "@/types/khat-map"

// ─── Final composite (batch ranking) ─────────────────────────────────────────
//
// The batch engine builds a `final_score` in [0, ~10] from these four
// normalized signals. Each signal is rescaled into the same magnitude
// (multiplied by 10 for readability), then summed weighted. Sum doesn't
// have to equal 1 — what matters is that `editorial` dominates and
// `taste` / `domain_balance` / `similarity` provide secondary nudges.

export const SCORE_WEIGHTS = {
  /** LLM editorial confidence (0–10 → up to 5.0). */
  editorial: 0.5,
  /** Taste-profile alignment (0–1 → up to 2.0). */
  taste: 0.2,
  /** Inverse of domain saturation in this season (0–1 → up to 1.5). */
  domain_balance: 0.15,
  /** Soft-avoid penalty inverted (1 − sim → up to 1.5). */
  similarity: 0.15,
} as const

// ─── Editorial-controls multipliers (post-LLM, per-card) ─────────────────────
//
// Applied as a multiplier on `final_score` AFTER the four signals above
// combine. A multiplier of 1.0 means neutral (no change), 0 hard-blocks
// the candidate, anything else nudges.

/** Per-domain weight from `editorial_controls.domain_weights`. */
export const DOMAIN_WEIGHT_FACTOR: Record<KhatMapDomainWeight, number> = {
  0: 0,    // disabled — filtered out before scoring runs; 0 is a safety net
  1: 0.7,  // low: lose ~30%
  2: 1.0,  // neutral / default
  3: 1.3,  // high: gain ~30%
}

// ─── Topic-bank quality multipliers ──────────────────────────────────────────
//
// Applied when a card's `topic_angle_code` matches a topic in the bank.
// `deprecated` should be hard-blocked upstream; the 0 here is defensive.

export const TOPIC_QUALITY_FACTOR: Record<KhatMapTopicQuality, number> = {
  strong: 1.25,
  normal: 1.0,
  weak: 0.7,
  deprecated: 0,
}

// ─── Guest-bank quality multipliers ──────────────────────────────────────────
//
// Applied when a card's guest matches a known bank entry. `avoid` is
// effectively a hard block (post-filter would also catch it).

export const GUEST_QUALITY_FACTOR: Record<KhatMapGuestQuality, number> = {
  strong: 1.25,
  normal: 1.0,
  weak: 0.75,
  avoid: 0,
}

// ─── Performance feedback (closes the loop) ─────────────────────────────────
//
// `performance_score` per published episode is in [0, 1]. We aggregate
// per domain and pass the mean into the scorer as a multiplier band.
// Tuning principle:
//   • A domain whose published episodes averaged 0.8 perf → boost ~+15%
//   • A domain whose published episodes averaged 0.2 perf → penalty ~−15%
//   • Domains with too few episodes ( < MIN_EPISODES_FOR_PERF ) get the
//     neutral 1.0 — we don't punish unproven domains.

export const PERFORMANCE_BAND = {
  /** Multiplier range: low end when domain perf = 0, high end when perf = 1. */
  min_factor: 0.85,
  max_factor: 1.15,
  /** Domain needs this many published episodes before perf affects scoring. */
  min_episodes: 3,
} as const

/**
 * Map a per-domain mean performance score (0–1) to a final-score multiplier.
 * Domains with too few data points return the neutral 1.0.
 */
export function performanceFactor(
  meanScore: number | null,
  episodeCount: number,
): number {
  if (
    meanScore === null ||
    !Number.isFinite(meanScore) ||
    episodeCount < PERFORMANCE_BAND.min_episodes
  ) {
    return 1.0
  }
  const clamped = Math.max(0, Math.min(1, meanScore))
  return (
    PERFORMANCE_BAND.min_factor +
    (PERFORMANCE_BAND.max_factor - PERFORMANCE_BAND.min_factor) * clamped
  )
}

// ─── Composite performance score (per published episode) ────────────────────
//
// Build a single [0, 1] score from whichever signals are persisted today.
// View count is the only real engagement metric we have; AI-content
// density (quotes, enrichments, chapters, clips) acts as a proxy for
// editorial care. As more signals come online (likes, retention), they
// compose in via the optional terms below.
//
// Math:
//   view_score    = log10(views + 1) / log10(VIEW_REFERENCE)   [0, 1, capped]
//   density_score = 0.5 * (quotes / QUOTE_REFERENCE, capped)
//                 + 0.125 each for has_enrichment / has_chapters / has_clips
//                                                              [0, 1]
//   final = view_weight * view_score + density_weight * density_score
//         + (optional) like_weight * like_score
//         + (optional) retention_weight * retention_pct
//
// Weights re-normalize when an optional signal is missing so the
// composite never gets unfairly small. See `composePerformanceScore`.

export const PERFORMANCE_COMPOSITION = {
  /** A view count of this size maps to view_score = 1.0. */
  view_reference: 10_000,
  /** A quote count of this size contributes the full density-from-quotes term. */
  quote_reference: 8,

  // Default weights when only "view" + "density" are available
  view_weight: 0.6,
  density_weight: 0.4,

  // Optional weights — reserved for when ingestion lands them
  like_weight: 0.15,
  retention_weight: 0.25,
} as const

// ─── Card-quality labels (Phase 9 placeholder — wired but not yet enforced) ──
//
// The batch engine assigns a label based on `final_score`. Currently used
// only by the explainability layer; Phase 9 (quality guardrails) will use
// these to drop "weak" cards or re-prompt to improve them.

export type KhatMapCardQuality = "excellent" | "good" | "needs_improvement" | "weak"

export const CARD_QUALITY_THRESHOLDS = {
  excellent: 8.5,
  good: 6.5,
  needs_improvement: 4.5,
  // anything below `needs_improvement` is "weak"
} as const

export function classifyCardQuality(finalScore: number): KhatMapCardQuality {
  if (finalScore >= CARD_QUALITY_THRESHOLDS.excellent) return "excellent"
  if (finalScore >= CARD_QUALITY_THRESHOLDS.good) return "good"
  if (finalScore >= CARD_QUALITY_THRESHOLDS.needs_improvement)
    return "needs_improvement"
  return "weak"
}
