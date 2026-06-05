/**
 * Khat Map v2 — card explainability.
 *
 * Builds the three Arabic blurbs that appear on every BatchCard:
 *
 *   • why_suggested      — the editorial reason the engine ranked this card.
 *   • risks              — the most relevant downsides (similarity, low taste,
 *                          domain over-cap, weak performance band).
 *   • expected_outcome   — what the historical performance band implies for
 *                          this domain. Null when the season has < 3 published
 *                          episodes in the domain (no honest signal yet).
 *
 * This module is deterministic and never calls the LLM — it reads the same
 * signals the scorer used (editorial_score, taste_alignment, similarity,
 * domain_load, domain_performance) and translates them into honest copy.
 * No invented facts; if a signal isn't available, the corresponding line
 * simply doesn't appear.
 */

import type {
  KhatMapDomainPerformance,
  KhatMapTopicDomain,
  KhatMapUserTasteProfile,
} from "@/types/khat-map"
import type { CardExplainability, ScoredCandidate } from "./types"
import { TASTE_CONFIDENCE_MIN_DECISIONS } from "@/lib/khat-map/learning/taste"
import { PERFORMANCE_BAND } from "@/lib/khat-map/scoring/weights"

interface BuildExplainabilityInput {
  scored: ScoredCandidate
  taste: KhatMapUserTasteProfile
  domain_performance: KhatMapDomainPerformance | null
  similarity_trigger_title: string | null
}

const EDITORIAL_STRONG = 7.5
const TASTE_HIGH = 0.7
const TASTE_LOW = 0.3
const DOMAIN_OVER_CAP = 0.6
const PERF_LOW = 0.4
const PERF_HIGH = 0.7

export function buildCardExplainability(
  input: BuildExplainabilityInput,
): CardExplainability {
  const { scored, taste, domain_performance, similarity_trigger_title } = input
  const raw = scored.raw

  // ─── why_suggested — pick the strongest honest reason ──────────────────────
  const reasons: string[] = []

  if (raw.editorial_score >= EDITORIAL_STRONG) {
    reasons.push("تقييم تحريري قوي")
  }
  if (
    taste.total_decisions >= TASTE_CONFIDENCE_MIN_DECISIONS &&
    scored.taste_alignment >= TASTE_HIGH
  ) {
    reasons.push("متوافقة مع ذوقك")
  }
  if (scored.domain_load <= 0.2) {
    reasons.push("تُغني تنوّع الموسم")
  }
  if (
    domain_performance &&
    domain_performance.episodes_count >= PERFORMANCE_BAND.min_episodes &&
    domain_performance.avg_performance >= PERF_HIGH
  ) {
    reasons.push("هذا المجال يحقق أداءً ممتازًا تاريخيًا")
  }
  if (raw.topic.topic_angle_code) {
    reasons.push("زاوية محفوظة في بنك المواضيع")
  }

  // Fallback when no signal stood out — be honest, not generic praise.
  const why_suggested =
    reasons.length > 0
      ? reasons.slice(0, 2).join(" • ")
      : "اقتراح تحريري ضمن النطاق العادي"

  // ─── risks — surface every relevant downside, in priority order ────────────
  const risks: string[] = []

  if (scored.similarity_verdict === "soft_avoid") {
    risks.push(
      similarity_trigger_title
        ? `قريبة من حلقة سابقة: "${similarity_trigger_title}"`
        : "قريبة من حلقة سابقة",
    )
  }
  if (scored.domain_load >= DOMAIN_OVER_CAP) {
    risks.push("مجال متكرر في هذا الموسم")
  }
  if (
    taste.total_decisions >= TASTE_CONFIDENCE_MIN_DECISIONS &&
    scored.taste_alignment < TASTE_LOW
  ) {
    risks.push("بعيدة عن ذوقك حسب القرارات السابقة")
  }
  if (
    domain_performance &&
    domain_performance.episodes_count >= PERFORMANCE_BAND.min_episodes &&
    domain_performance.avg_performance < PERF_LOW
  ) {
    risks.push("أداء هذا المجال ضعيف تاريخيًا")
  }
  if (!raw.guest) {
    risks.push("لم يُقترح ضيف")
  }

  // ─── expected_outcome — performance-band forecast ──────────────────────────
  const expected_outcome = buildExpectedOutcome(domain_performance)

  return { why_suggested, risks, expected_outcome }
}

function buildExpectedOutcome(
  perf: KhatMapDomainPerformance | null,
): string | null {
  if (!perf) return null
  if (perf.episodes_count < PERFORMANCE_BAND.min_episodes) return null

  const score = perf.avg_performance
  const n = perf.episodes_count
  const basis = `بناءً على ${n} حلقات منشورة`

  if (score >= 0.7) return `متوقّع أداء عالٍ (${basis})`
  if (score >= 0.5) return `متوقّع أداء جيد (${basis})`
  if (score >= 0.3) return `متوقّع أداء متوسط (${basis})`
  return `متوقّع أداء منخفض (${basis})`
}

/**
 * Lookup helper used by the engines: pull this card's domain row from the
 * map (returns null when the domain has no published episodes yet).
 */
export function lookupDomainPerformance(
  map: Map<KhatMapTopicDomain, KhatMapDomainPerformance>,
  domain: KhatMapTopicDomain,
): KhatMapDomainPerformance | null {
  return map.get(domain) ?? null
}
