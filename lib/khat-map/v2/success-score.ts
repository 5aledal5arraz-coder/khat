/**
 * Khat success score — the constitution's dimensions (2026-09-28).
 *
 * The model self-scores each dimension 0-10 and the Editorial Court re-
 * calibrates them; the composite is a priority-weighted average gated by
 * brand alignment. It ORDERS the list — it is not a probability of success
 * and the UI must not call it one.
 *
 * What changed with the constitution: Khat is not views-optimised. The old
 * 14 dimensions led on click / retention / shareability / global relevance
 * — popularity proxies. They are gone. What remains is what «دستور خط» asks:
 *
 *   worth_telling (highest) · human_experience · practical_value ·
 *   segment_fit · library_value · guest_findability · originality ·
 *   brand_alignment (also the gate)
 *
 * Rows scored before this change carry the old keys; clampSuccessDimensions
 * fills every missing key with a neutral 5, so they still render and rank.
 *
 * Pure math. No I/O.
 */

export interface SuccessDimensions {
  /** «هل القصة/التجربة تستحق أن تُروى؟» — the constitution's criterion. */
  worth_telling: number
  /** Rests on something a real person lived (even an expert brings his experience). */
  human_experience: number
  /** A practical takeaway that comes from the lived experience — not generic advice. */
  practical_value: number
  /** Speaks to a real life-stage concern of one of the two audience segments. */
  segment_fit: number
  /** «بعد خمس سنين، أحد بيرجع للحلقة ويستفيد؟» — reference value that lasts. */
  library_value: number
  /** A Kuwaiti man with a first-hand account plausibly exists and is reachable. */
  guest_findability: number
  /** Freshness — not the tired framing everyone uses. */
  originality: number
  /** Fit with Khat's constitution (also a gate). */
  brand_alignment: number
}

export type SuccessDimension = keyof SuccessDimensions

/**
 * worth_telling leads — it IS the constitution's criterion. Sum need not be
 * 1: the composite normalises by it.
 */
export const SUCCESS_WEIGHTS: Record<SuccessDimension, number> = {
  worth_telling: 2,
  human_experience: 1.4,
  practical_value: 1.3,
  library_value: 1.3,
  segment_fit: 1.1,
  guest_findability: 1.1,
  originality: 1,
  brand_alignment: 1,
}

const WEIGHT_SUM = Object.values(SUCCESS_WEIGHTS).reduce((a, b) => a + b, 0)
const DIMENSIONS = Object.keys(SUCCESS_WEIGHTS) as SuccessDimension[]

/**
 * Default acceptance bar (0-100). Neutral (all 5s) scores 50, so 60 means
 * "clearly above average, with margin." Candidates below this are rejected or
 * regenerated. Slightly more selective than v1 (58) now that the weights reward
 * the qualities Khat actually wants.
 */
export const SUCCESS_THRESHOLD = 60

function clampScore(v: unknown, fallback = 5): number {
  const n = Number(v)
  if (!Number.isFinite(n)) return fallback
  return Math.max(0, Math.min(10, n))
}

/** Coerce raw model output into a complete SuccessDimensions (missing → neutral 5). */
export function clampSuccessDimensions(raw: unknown): SuccessDimensions {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  const out = {} as SuccessDimensions
  for (const d of DIMENSIONS) out[d] = clampScore(o[d])
  return out
}

/** Neutral dimensions — used when no model scoring is available. */
export function neutralSuccessDimensions(): SuccessDimensions {
  const out = {} as SuccessDimensions
  for (const d of DIMENSIONS) out[d] = 5
  return out
}

/**
 * The composite ordering score in [0, 100]. Brand alignment doubles as a
 * gate: an idea that betrays the constitution (brand_alignment ≤ 3) is pulled
 * down hard so an off-brand idea can't win the ranking.
 */
export function computeSuccessScore(dims: SuccessDimensions): number {
  let acc = 0
  for (const d of DIMENSIONS) acc += SUCCESS_WEIGHTS[d] * dims[d]
  let score = (acc / WEIGHT_SUM) * 10 // 0-10 weighted avg → 0-100
  if (dims.brand_alignment <= 3) {
    score *= dims.brand_alignment / 6
  }
  return Math.round(Math.max(0, Math.min(100, score)))
}

/** Ranking value in [0, 10] — keeps the selector + diversity penalties calibrated. */
export function successScoreToRank(score: number): number {
  return Math.max(0, Math.min(10, score / 10))
}

/** Whether a candidate clears the bar. */
export function passesSuccessThreshold(score: number, threshold = SUCCESS_THRESHOLD): boolean {
  return score >= threshold
}

export type SuccessBand = "exceptional" | "strong" | "solid" | "weak"

/** A label band for the UI (color + words). `solid` starts at the acceptance bar. */
export function successBand(score: number): SuccessBand {
  if (score >= 85) return "exceptional"
  if (score >= 72) return "strong"
  if (score >= SUCCESS_THRESHOLD) return "solid"
  return "weak"
}

/** Per-dimension breakdown for card explainability / debugging. */
export function successBreakdown(
  dims: SuccessDimensions,
): Array<{ dimension: SuccessDimension; score: number; weight: number }> {
  return DIMENSIONS.map((d) => ({ dimension: d, score: dims[d], weight: SUCCESS_WEIGHTS[d] }))
}

/** Arabic labels for the dimensions (UI). */
export const SUCCESS_DIMENSION_LABELS_AR: Record<SuccessDimension, string> = {
  worth_telling: "تستحق أن تُروى",
  human_experience: "تجربة إنسانية",
  practical_value: "فائدة عملية",
  segment_fit: "ملاءمة الشريحة",
  library_value: "قيمة مرجعية تبقى",
  guest_findability: "ضيف يمكن إيجاده",
  originality: "أصالة",
  brand_alignment: "انسجام مع دستور خط",
}

/** The dimension keys, in weight order — for prompt contracts and the UI. */
export const SUCCESS_DIMENSIONS: readonly SuccessDimension[] = (
  Object.keys(SUCCESS_WEIGHTS) as SuccessDimension[]
).sort((a, b) => SUCCESS_WEIGHTS[b] - SUCCESS_WEIGHTS[a])

/** The `success` object contract rendered for a prompt: `{ "worth_telling": 0-10, … }`. */
export function successFieldsSpec(): string {
  return `{ ${SUCCESS_DIMENSIONS.map((d) => `"${d}": 0-10`).join(", ")} }`
}
