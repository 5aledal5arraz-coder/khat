/**
 * Phase X Step 3 — Tie-breaker scoring for hybrid candidates.
 *
 * The model returns its own `estimated_strength_score`. We re-score on
 * top of that to bias toward:
 *   - depth (length of conflict/why_it_matters as a proxy for thought)
 *   - originality (lens diversity inside the batch)
 *   - signal-fit (worked-report bias toward strong topic_domains)
 *
 * Used to ORDER accepted topics so the strongest land in the top slots
 * of the candidate list — never to override a rejection.
 */

import type { HybridCandidate } from "./reject"
import type { WorkedReport } from "@/lib/khat-brain/performance-learning"

export interface ScoringContext {
  worked_report: WorkedReport
  /** Lens diversity bias — penalize the 4th, 5th… use of the same lens in one batch. */
  batchLensCounts: Map<string, number>
}

const STRONG_DOMAIN_BONUS = 0.12
const WEAK_DOMAIN_PENALTY = 0.08
const LENS_REPEAT_PENALTY = 0.05

export function rescoreHybridCandidate(
  c: HybridCandidate,
  ctx: ScoringContext,
): number {
  let score = clamp01(c.estimated_strength_score ?? 0.5)

  // Depth proxy: longer-but-not-rambling fields = more thought.
  const depthSignal = depthScore(c)
  score = clamp01(score * 0.7 + depthSignal * 0.3)

  // Strong/weak domain bias from Phase 8 learning.
  const strong = new Set(
    ctx.worked_report.strong_topic_domains.map((d) => d.key),
  )
  const weak = new Set(ctx.worked_report.weak_topic_domains.map((d) => d.key))
  if (strong.has(c.suggested_topic_domain)) score = clamp01(score + STRONG_DOMAIN_BONUS)
  if (weak.has(c.suggested_topic_domain)) score = clamp01(score - WEAK_DOMAIN_PENALTY)

  // Lens-diversity penalty (the 4th use of the same lens in one batch
  // gets dinged so the editor sees variety).
  const lensCount = ctx.batchLensCounts.get(c.original_lens) ?? 0
  if (lensCount >= 3) score = clamp01(score - LENS_REPEAT_PENALTY * (lensCount - 2))

  return Number(score.toFixed(3))
}

function depthScore(c: HybridCandidate): number {
  const sum =
    safeLen(c.why_it_matters) +
    safeLen(c.why_now) +
    safeLen(c.conflict_angle) +
    safeLen(c.emotional_hook)
  // 600 chars across the four fields is about where "real thought" tends
  // to live; clamp into [0,1].
  return clamp01(sum / 600)
}

function safeLen(s: string | null | undefined): number {
  return typeof s === "string" ? Math.min(s.length, 200) : 0
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0
  return Math.max(0, Math.min(1, v))
}
