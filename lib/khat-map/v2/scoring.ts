/**
 * Pure scoring math for the Khat Map v2 batch engine.
 *
 * Three signals combine into a final rank:
 *   1. Editorial score   — what the LLM thought of the candidate (0-10)
 *   2. Taste alignment   — how well it maps to the admin's learned profile (0-1)
 *   3. Domain load       — how over-represented this domain already is (0-1)
 *
 * Plus the similarity verdict from the learning layer (hard_block items
 * are already dropped upstream; soft_avoid items get a linear penalty).
 *
 * Weights are tunable constants — change here and the whole pipeline
 * follows.
 */

import type {
  KhatMapTopicDomain,
  KhatMapUserTasteProfile,
} from "@/types/khat-map"
import { TASTE_CONFIDENCE_MIN_DECISIONS } from "@/lib/khat-map/learning/taste"
import type { SimilarityVerdict } from "@/lib/khat-map/learning/embeddings"
import type { RawCandidate, ScoredCandidate } from "./types"

// ─── Weights ────────────────────────────────────────────────────────────────
// Sum doesn't have to equal 1 — each signal is already normalized into a
// comparable scale before multiplication.

export const SCORE_WEIGHTS = {
  editorial: 0.5, // LLM score (0-10 → contributes up to 5.0)
  taste: 0.2, // taste alignment (0-1 → contributes up to 2.0)
  domain_balance: 0.15, // inverse of domain_load (0-1 → up to 1.5)
  similarity: 0.15, // soft-avoid penalty (1 - similarity_max → up to 1.5)
}

// ─── Domain load ─────────────────────────────────────────────────────────────

/**
 * How saturated a domain is in the current season. Returns 0 when the
 * domain is absent and grows linearly; clamps at 1 once the domain
 * hits its cap (default: 1/3 of the total season).
 *
 * E.g. for a 10-episode season, each domain's cap is 3. A candidate
 * targeting a domain with 2 already-accepted gets a load of 0.67; one
 * with 3 gets 1.0 (fully saturated — heavy rank penalty).
 */
export function computeDomainLoad(
  domain: KhatMapTopicDomain,
  accepted_counts: Record<KhatMapTopicDomain, number>,
  season_target: number,
): number {
  const n = accepted_counts[domain] ?? 0
  const cap = Math.max(2, Math.ceil(season_target / 3))
  return Math.min(1, n / cap)
}

// ─── Taste alignment ─────────────────────────────────────────────────────────

/**
 * How closely a candidate matches the admin's derived taste. Considers:
 *   - `preferred_domains` weights for the candidate's topic_domain
 *   - depth / controversy / emotional / kuwait axis positions via the
 *     same domain → axis mapping used in the recompute
 *
 * Returns a value in [0, 1] where 0.5 is "no signal" (neutral seed).
 * When `total_decisions < TASTE_CONFIDENCE_MIN_DECISIONS`, we clamp
 * toward 0.5 so the early-learning period doesn't skew ranking.
 */
export function computeTasteAlignment(
  raw: RawCandidate,
  taste: KhatMapUserTasteProfile,
): number {
  if (taste.total_decisions === 0) return 0.5

  const domain = raw.topic.topic_domain
  // 1) Domain preference direct lookup
  const domainPref = taste.preferred_domains.find((d) => d.domain === domain)
  const domainContribution = domainPref ? domainPref.weight : 0.5

  // 2) Axis contribution — map the domain to its axis, compare with
  //    the admin's axis score. Closer to the admin's position → higher.
  const axis = domainToAxis(domain)
  const axisScore = axis ? taste[axis] : 0.5

  // Both signals live in [0, 1]; average them.
  let alignment = (domainContribution + axisScore) / 2

  // Dampen when confidence is low — pull toward 0.5.
  const confidence = Math.min(
    1,
    taste.total_decisions / TASTE_CONFIDENCE_MIN_DECISIONS,
  )
  alignment = 0.5 + (alignment - 0.5) * confidence
  return clamp01(alignment)
}

type TasteAxis =
  | "depth_score"
  | "controversy_tolerance"
  | "emotional_preference"
  | "kuwait_relevance_weight"

function domainToAxis(domain: KhatMapTopicDomain): TasteAxis | null {
  switch (domain) {
    case "philosophy":
    case "psychology":
    case "hidden_history":
    case "historical":
      return "depth_score"
    case "religion":
    case "power_manipulation":
    case "crime_mystery":
    case "social_issues":
      return "controversy_tolerance"
    case "emotions_inner_life":
    case "relationships":
    case "parenting":
      return "emotional_preference"
    case "kuwait_gulf":
      return "kuwait_relevance_weight"
    default:
      return null
  }
}

// ─── Similarity penalty ──────────────────────────────────────────────────────

/**
 * Soft-avoid candidates take a penalty proportional to how close they
 * got to the block line. Hard-block candidates should be dropped before
 * reaching this function; we defensively return 0 if one slips through.
 */
export function computeSimilarityScore(
  verdict: SimilarityVerdict,
  similarity_max: number,
): number {
  if (verdict === "hard_block") return 0
  // 1 - max means "how different from the closest negative we are."
  // For soft-avoid (> 0.75), this is in [0, 0.25]. For ok, it can be
  // anywhere in [0, 1] — but most OK candidates sit 0-0.75 → score
  // 0.25-1.0. We normalize so an "ok" candidate dominates a
  // "soft_avoid" one of equal editorial quality.
  if (verdict === "soft_avoid") {
    return Math.max(0, 1 - similarity_max) * 0.5 // soft penalty
  }
  return Math.max(0, 1 - similarity_max)
}

// ─── Final composite ─────────────────────────────────────────────────────────

export function computeFinalScore(partial: {
  editorial_score: number
  taste_alignment: number
  domain_load: number
  similarity_verdict: SimilarityVerdict
  similarity_max: number
}): number {
  const editorial = (partial.editorial_score / 10) * 10 * SCORE_WEIGHTS.editorial
  const taste = partial.taste_alignment * 10 * SCORE_WEIGHTS.taste
  const balance = (1 - partial.domain_load) * 10 * SCORE_WEIGHTS.domain_balance
  const similarity =
    computeSimilarityScore(partial.similarity_verdict, partial.similarity_max) *
    10 *
    SCORE_WEIGHTS.similarity
  return editorial + taste + balance + similarity
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function clamp01(x: number): number {
  if (Number.isNaN(x)) return 0
  return Math.max(0, Math.min(1, x))
}

/**
 * When ranking a batch, we additionally want to avoid stacking same-
 * domain cards inside one batch. Caller passes already-picked cards;
 * this returns a penalty so the next pick deprioritizes duplicates.
 */
export function withinBatchDomainPenalty(
  candidate: ScoredCandidate,
  already_picked: ScoredCandidate[],
): number {
  const picks = already_picked.filter(
    (p) => p.raw.topic.topic_domain === candidate.raw.topic.topic_domain,
  ).length
  // 1 same-domain card is fine; 2 starts penalizing; 3+ strongly penalized.
  if (picks === 0) return 0
  if (picks === 1) return 0.5
  return 2.0
}

// ─── Taste-reasoning generator ───────────────────────────────────────────────

/**
 * Produce the Arabic "Why this fits YOU" line shown on each card. Returns
 * null when the profile has insufficient signal — the UI hides the block
 * entirely rather than showing low-confidence reasoning.
 */
export function buildTasteReasoning(
  raw: RawCandidate,
  taste: KhatMapUserTasteProfile,
): string | null {
  if (taste.total_decisions < TASTE_CONFIDENCE_MIN_DECISIONS) return null

  const domain = raw.topic.topic_domain
  const pref = taste.preferred_domains.find((d) => d.domain === domain)
  const axis = domainToAxis(domain)

  const parts: string[] = []
  if (pref && pref.weight > 0.6) {
    parts.push(`تميل لمحتوى ${describeDomain(domain)}`)
  }
  if (axis) {
    const axisValue = taste[axis]
    if (axisValue > 0.65) {
      parts.push(describeAxisHigh(axis))
    } else if (axisValue < 0.35) {
      parts.push(describeAxisLow(axis))
    }
  }
  if (parts.length === 0) return null
  return `يناسب ذوقك: ${parts.join("، ")}.`
}

function describeDomain(d: KhatMapTopicDomain): string {
  const map: Partial<Record<KhatMapTopicDomain, string>> = {
    philosophy: "فلسفي",
    psychology: "نفسي",
    hidden_history: "تاريخي خفي",
    historical: "تاريخي",
    religion: "ديني جريء",
    power_manipulation: "تحقيقي",
    crime_mystery: "جريمة وغموض",
    social_issues: "اجتماعي نقدي",
    emotions_inner_life: "عاطفي داخلي",
    relationships: "علاقات",
    parenting: "تربية",
    kuwait_gulf: "كويتي / خليجي",
    technology_ai: "تقني",
    internet_culture: "ثقافة إنترنت",
    money_career: "مال ومهنة",
    identity_masculinity: "هوية ورجولة",
    modern_society: "مجتمع حديث",
    none: "متعدد",
  }
  return map[d] ?? d
}

function describeAxisHigh(axis: TasteAxis): string {
  switch (axis) {
    case "depth_score":
      return "تفضّل العمق"
    case "controversy_tolerance":
      return "تتقبّل الجرأة"
    case "emotional_preference":
      return "تفضّل الحسّ العاطفي"
    case "kuwait_relevance_weight":
      return "تفضّل الصلة الكويتية"
  }
}

function describeAxisLow(axis: TasteAxis): string {
  switch (axis) {
    case "depth_score":
      return "تفضّل محتوى أخفّ"
    case "controversy_tolerance":
      return "تفضّل الحذر"
    case "emotional_preference":
      return "تفضّل المسافة العقلية"
    case "kuwait_relevance_weight":
      return "تفضّل الطابع العالمي"
  }
}
