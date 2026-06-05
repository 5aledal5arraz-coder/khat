/**
 * Phase 5 — Score explanation (Arabic operator copy).
 *
 * Picks the 1-2 dominant contributors from score_components and
 * formats them as a short, plain-Arabic sentence. Never exposes the
 * raw JSON, the internal weight names, or the numeric coefficients.
 */

import type { ScoreComponents } from "@/lib/market-intelligence/scoring"

interface ContribLabel {
  /** Arabic phrase when the contribution is POSITIVE. */
  pos: string
  /** Arabic phrase when the contribution is NEGATIVE (penalty). */
  neg: string
}

const COMPONENT_COPY: Record<keyof ScoreComponents, ContribLabel> = {
  source_trust: {
    pos: "مصدر موثوق بدرجة عالية",
    neg: "ثقة مصدر منخفضة",
  },
  editorial_alignment: {
    pos: "ينسجم مع هوية خط التحريرية",
    neg: "انسجام تحريري منخفض",
  },
  review_status: {
    pos: "اعتمدتَها كإشارة قوية",
    neg: "رفضتَها أو أرشفتَها",
  },
  operator_created: {
    pos: "إشارة كتبتَها يدوياً",
    neg: "",
  },
  recency: {
    pos: "إشارة طازجة",
    neg: "إشارة قديمة",
  },
  popularity: {
    pos: "تفاعل جمهور قوي",
    neg: "تفاعل جمهور محدود",
  },
  controversy: {
    pos: "تثير نقاشاً",
    neg: "",
  },
  taste_match: {
    pos: "تتقاطع مع ما يعجبك عادةً",
    neg: "بعيدة عمّا اخترتَ سابقاً",
  },
  tag_adjust: {
    pos: "وسومها التحريرية إيجابية",
    neg: "وسومها التحريرية سلبية",
  },
}

/** Sort components by absolute contribution, drop noise, return up to 2
 *  dominant phrases. Returns an Arabic sentence ready for display. */
export function explainScoreArabic(
  components: ScoreComponents | null | undefined,
  score: number | null,
): string {
  if (!components || score === null || score === undefined) {
    return "لم يتم تقييمها بعد."
  }
  const entries = Object.entries(components) as Array<
    [keyof ScoreComponents, number]
  >
  const ranked = entries
    .filter(([k, v]) => {
      // Don't surface zero or negligible contributions in the
      // top-line copy; they're noise.
      return Math.abs(v) >= 0.02 && COMPONENT_COPY[k] != null
    })
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, 2)

  if (ranked.length === 0) {
    if (score >= 0.7) return "تقييم قوي بناءً على عدة عوامل."
    if (score >= 0.4) return "تقييم متوسط."
    return "تقييم منخفض — لا توجد إشارات قوية تدعمها."
  }
  const phrases = ranked
    .map(([k, v]) => {
      const labels = COMPONENT_COPY[k]
      const phrase = v >= 0 ? labels.pos : labels.neg
      return phrase || null
    })
    .filter((p): p is string => !!p)

  if (phrases.length === 0) return "تقييم محسوب من عدة عوامل."
  if (phrases.length === 1) return phrases[0] + "."
  return `${phrases[0]} · ${phrases[1]}.`
}

/** Arabic tone class for the score badge — `قوية / متوسطة / ضعيفة`. */
export function scoreToneArabic(score: number | null): {
  label: string
  tone: "ok" | "warn" | "muted"
} {
  if (score === null || score === undefined) {
    return { label: "—", tone: "muted" }
  }
  if (score >= 0.7) return { label: "قوية", tone: "ok" }
  if (score >= 0.4) return { label: "متوسطة", tone: "warn" }
  return { label: "ضعيفة", tone: "muted" }
}
