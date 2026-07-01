/**
 * Phase X Step 3 — Hybrid generator quality + novelty filter.
 *
 * Extends the original-thinking rejection rules with hybrid-specific
 * checks:
 *   - missing market_inspiration                 → "missing_market_inspiration"
 *   - missing original_lens                      → "missing_original_lens"
 *   - too close to existing Khat Map candidates  → "near_dup_khat_map"
 *   - too close to consumed original topics      → "near_dup_consumed_original"
 *
 * All other rules are inherited from lib/original-thinking/novelty.ts
 * via judgeCandidate so we don't duplicate the generic-title /
 * weak-hook / vague-conflict / Kuwait-bias logic.
 */

import {
  judgeCandidate,
  REJECTION_RULES as ORIGINAL_REJECTION_RULES,
  type CandidateTopic as OriginalCandidate,
  type NoveltyContext,
  type RejectionReason as OriginalRejectionReason,
} from "@/lib/original-thinking/novelty"
// Use the strong token-Jaccard near-dup matcher (NFKC + tashkeel-aware) — the
// same one the batch engine uses — instead of exact normalized-string equality,
// so paraphrased duplicates are caught too.
import { isNearDuplicateTitle } from "@/lib/khat-map/v2/title-similarity"

// Hybrid-specific reasons. Inherits + extends the original-thinking set.
export type HybridRejectionReason =
  | OriginalRejectionReason
  | "missing_market_inspiration"
  | "missing_original_lens"
  | "near_dup_khat_map"
  | "near_dup_consumed_original"
  | "weak_strength_score"
  | "missing_episode_type"
  | "missing_topic_domain"

export interface HybridCandidate {
  title: string
  why_it_matters: string
  why_now: string
  emotional_hook: string
  conflict_angle: string
  market_inspiration: string
  /** The market cluster label (= signal theme) this topic drew from, or "none". */
  primary_theme?: string
  original_lens: string
  suggested_episode_type: string
  suggested_topic_domain: string
  estimated_strength_score: number
  /** Episode SHAPE (shared creative brief). Drives archetype-diversity in scoring. */
  archetype?: string
  /** One line: why this angle is fresh / not the done-to-death version. */
  novelty_note?: string
}

export interface HybridJudgeContext extends NoveltyContext {
  /** Existing Khat Map candidate titles to dedup against. */
  khatMapTitles: string[]
  /** Consumed original-topic titles. */
  consumedOriginalTitles: string[]
  /** Allowed episode_type values. */
  validEpisodeTypes: Set<string>
  /** Allowed topic_domain values. */
  validTopicDomains: Set<string>
}

export interface HybridDecision {
  ok: boolean
  reasons: HybridRejectionReason[]
}

const MIN_STRENGTH_SCORE = 0.4

export function judgeHybridCandidate(
  c: HybridCandidate,
  ctx: HybridJudgeContext,
): HybridDecision {
  const reasons: HybridRejectionReason[] = []

  // Inherit all six original-thinking rules.
  const original: OriginalCandidate = {
    title: c.title,
    lens: c.original_lens,
    philosophical_frame: c.why_it_matters || c.why_now,
    conflict: c.conflict_angle,
    emotional_hook: c.emotional_hook,
  }
  const inheritedDecision = judgeCandidate(original, ctx)
  for (const r of inheritedDecision.reasons) reasons.push(r)

  // Hybrid-specific checks.
  if (!c.market_inspiration || c.market_inspiration.trim().length < 10) {
    reasons.push("missing_market_inspiration")
  }
  if (!c.original_lens || !ctx.validLensKeys.has(c.original_lens)) {
    // judgeCandidate already records lens_mismatch when lens key is bad.
    // We add a parallel signal so the rejection_summary surfaces both.
    if (!c.original_lens) reasons.push("missing_original_lens")
  }
  if (!c.suggested_episode_type || !ctx.validEpisodeTypes.has(c.suggested_episode_type)) {
    reasons.push("missing_episode_type")
  }
  if (!c.suggested_topic_domain || !ctx.validTopicDomains.has(c.suggested_topic_domain)) {
    reasons.push("missing_topic_domain")
  }
  if (typeof c.estimated_strength_score !== "number" || c.estimated_strength_score < MIN_STRENGTH_SCORE) {
    reasons.push("weak_strength_score")
  }

  // Near-dup against Khat Map history (token-Jaccard, catches paraphrases).
  if (c.title && isNearDuplicateTitle(c.title, ctx.khatMapTitles)) {
    reasons.push("near_dup_khat_map")
  }
  if (c.title && isNearDuplicateTitle(c.title, ctx.consumedOriginalTitles)) {
    reasons.push("near_dup_consumed_original")
  }

  return { ok: reasons.length === 0, reasons: dedupeReasons(reasons) }
}

function dedupeReasons<T>(xs: T[]): T[] {
  return [...new Set(xs)]
}

// Documented rules — admin UI surfaces these alongside rejected outputs.
export const HYBRID_REJECTION_RULES: Record<HybridRejectionReason, string> = {
  ...ORIGINAL_REJECTION_RULES,
  missing_market_inspiration:
    "Topic does not name a market signal it transformed (must reference at least one cluster, hook, or emotional trigger).",
  missing_original_lens:
    "Topic did not specify which editorial lens elevated the market signal.",
  near_dup_khat_map:
    "Title is a near-duplicate (token similarity) of an existing khat_map_episode_candidates row — would create a within-show duplicate.",
  near_dup_consumed_original:
    "Title is a near-duplicate (token similarity) of an original-thinking topic the editor has already consumed.",
  weak_strength_score: `Self-rated strength_score is below ${MIN_STRENGTH_SCORE} — the model itself flagged the topic as marginal.`,
  missing_episode_type:
    "suggested_episode_type missing or not a valid KhatMapEpisodeType.",
  missing_topic_domain:
    "suggested_topic_domain missing or not a valid KhatMapTopicDomain.",
}
