/**
 * Composite performance score — pure math.
 *
 * Builds a single [0, 1] number from whichever signals were captured at
 * sync time. Honest about missing data: weights renormalize when an
 * optional term is absent, so a missing `like_count` doesn't drag the
 * score down — it just doesn't contribute.
 *
 * The math is in `lib/khat-map/scoring/weights.ts:PERFORMANCE_COMPOSITION`.
 * This module owns only the formula, not the tunables.
 */

import { PERFORMANCE_COMPOSITION } from "@/lib/khat-map/scoring/weights"

export interface PerformanceSignals {
  view_count: number | null
  quote_count: number
  has_enrichment: boolean
  has_chapters: boolean
  has_clips: boolean
  // Optional — usually null today
  like_count?: number | null
  comment_count?: number | null
  retention_pct?: number | null
}

/**
 * Compose a single score in [0, 1]. Returns `null` when no signal at
 * all is available (i.e. episode hasn't been published or AI Studio
 * hasn't run yet). Callers should treat null as "not enough data."
 */
export function composePerformanceScore(s: PerformanceSignals): number | null {
  const hasView = typeof s.view_count === "number" && s.view_count >= 0
  const hasContentSignal =
    s.quote_count > 0 || s.has_enrichment || s.has_chapters || s.has_clips

  if (!hasView && !hasContentSignal) return null

  const cfg = PERFORMANCE_COMPOSITION
  const terms: Array<{ score: number; weight: number }> = []

  if (hasView) {
    const v = Math.max(0, s.view_count!)
    const num = Math.log10(v + 1)
    const den = Math.log10(cfg.view_reference)
    const viewScore = den > 0 ? Math.min(1, num / den) : 0
    terms.push({ score: viewScore, weight: cfg.view_weight })
  }

  if (hasContentSignal) {
    const quoteTerm = Math.min(1, s.quote_count / cfg.quote_reference) * 0.5
    const flagTerm =
      (s.has_enrichment ? 0.2 : 0) +
      (s.has_chapters ? 0.15 : 0) +
      (s.has_clips ? 0.15 : 0)
    const densityScore = Math.min(1, quoteTerm + flagTerm)
    terms.push({ score: densityScore, weight: cfg.density_weight })
  }

  if (typeof s.like_count === "number" && s.like_count >= 0) {
    // 1k likes = full term. Same log family as views, smaller reference.
    const num = Math.log10(s.like_count + 1)
    const likeScore = Math.min(1, num / Math.log10(1000))
    terms.push({ score: likeScore, weight: cfg.like_weight })
  }

  if (typeof s.retention_pct === "number" && s.retention_pct >= 0) {
    // retention_pct in [0, 1] already
    const retScore = Math.max(0, Math.min(1, s.retention_pct))
    terms.push({ score: retScore, weight: cfg.retention_weight })
  }

  if (terms.length === 0) return null

  // Weighted average — re-normalize so missing terms don't shrink output.
  const totalWeight = terms.reduce((a, t) => a + t.weight, 0)
  if (totalWeight === 0) return null
  const score = terms.reduce((a, t) => a + (t.score * t.weight) / totalWeight, 0)
  return Math.max(0, Math.min(1, score))
}
