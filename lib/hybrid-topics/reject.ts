/**
 * Phase X Step 3 — Hybrid generator quality + novelty filter.
 *
 * Extends the original-thinking rejection rules with hybrid-specific
 * checks:
 *   - missing market_inspiration                 → "missing_market_inspiration"
 *   - missing original_lens                      → "missing_original_lens"
 *   - too close to existing Khat Map candidates  → "near_dup_khat_map"
 *   - too close to consumed original topics      → "near_dup_consumed_original"
 *   - the constitution's avoid list (politics, religious dispute, scandal,
 *     privacy): the deterministic lexicon      → "policy_avoid"
 *     or the model's own sensitivity_flags     → "policy_flagged"
 *
 * The self-rated score no longer rejects (constitution: scores only ORDER
 * the list) — `weak_strength_score` is kept for stored rows only.
 *
 * All other rules are inherited from lib/original-thinking/novelty.ts
 * via judgeCandidate so we don't duplicate the generic-title /
 * weak-hook / vague-conflict logic.
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
import { judgePolicy } from "@/lib/khat-map/core/policy"
import type { KhatTopicScores } from "./scoring"

// Hybrid-specific reasons. Inherits + extends the original-thinking set.
export type HybridRejectionReason =
  | OriginalRejectionReason
  | "missing_market_inspiration"
  | "missing_original_lens"
  | "near_dup_khat_map"
  | "near_dup_consumed_original"
  | "semantic_near_dup"
  | "weak_strength_score"
  | "missing_episode_type"
  | "missing_topic_domain"
  | "policy_flagged"

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
  /** The constitution's six self-scored dimensions (0–10). Only ORDER the list. */
  scores?: KhatTopicScores | null
  /** The model's own policy flags (lib/khat-map/core/policy.ts). Any flag rejects. */
  sensitivity_flags?: string[]
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

/** Only documents the retired rule for rows stored before the constitution. */
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

  // Hybrid-specific checks. "none" is a legitimate value since exploration
  // frames — a topic mined from an assigned territory needs no market anchor.
  const marketNone = (c.market_inspiration ?? "").trim().toLowerCase() === "none"
  if (!marketNone && (!c.market_inspiration || c.market_inspiration.trim().length < 10)) {
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

  // The constitution's avoid list: lexicon over the topic's own text, OR
  // the model's own flags. Either one rejects; neither can approve.
  // The lexicon reads the title + hook only (negations stripped); the body
  // is the model's to flag — prose explains, and a word list misreads it.
  const policy = judgePolicy(`${c.title}. ${c.emotional_hook}`, c.sensitivity_flags)
  if (policy.lexicon.length > 0) reasons.push("policy_avoid")
  if (policy.flagged.length > 0) reasons.push("policy_flagged")

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
    'Topic does not name a market signal it transformed, and did not declare itself purely original ("none").',
  missing_original_lens:
    "Topic did not specify which editorial lens elevated the market signal.",
  near_dup_khat_map:
    "Title is a near-duplicate (token similarity) of an existing khat_map_episode_candidates row — would create a within-show duplicate.",
  near_dup_consumed_original:
    "Title is a near-duplicate (token similarity) of an original-thinking topic the editor has already consumed.",
  semantic_near_dup:
    "Topic is a near-duplicate IN MEANING (embedding similarity) of a stronger topic in the same batch — kept the stronger one.",
  weak_strength_score: `(retired 2026-09-28 — scores only order the list now) Self-rated strength_score was below ${MIN_STRENGTH_SCORE}.`,
  missing_episode_type:
    "suggested_episode_type missing or not a valid KhatMapEpisodeType.",
  missing_topic_domain:
    "suggested_topic_domain missing or not a valid KhatMapTopicDomain.",
  policy_flagged:
    "The model flagged the topic itself (politics / religious_dispute / scandal / privacy_intrusion).",
}
