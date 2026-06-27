/**
 * Success Probability — the evolution of Regional Audience Fit.
 *
 * RAF (regional-fit.ts) scored 9 audience factors. The editorial engine scores a
 * richer FOURTEEN dimensions and returns a single 0-100 "would this be a great
 * Khat episode" probability. Each dimension is 0-10, self-scored by the
 * generator and then re-calibrated by the Editorial Court (the skeptical
 * producer). The composite is a priority-weighted average, gated by brand
 * alignment so a viral-but-off-brand idea can never top the ranking.
 *
 * The 0-10 dimensions map 1:1 to the user-facing axes:
 *   click · retention · discussion · shareability · guest · sponsor · timeless ·
 *   regional · global · brand · originality · depth · risk-calibration · feasibility
 *
 * Pure math. No I/O. RAF stays available for the legacy audience-first path.
 */

export interface SuccessDimensions {
  /** Will people click / press play? (thumbnail + title + premise pull) */
  click_potential: number
  /** Will they stay to the end? (depth, narrative, payoff) */
  retention_potential: number
  /** How much debate + conversation does it spark? */
  discussion_potential: number
  /** Share-ability — does it travel beyond the core audience? */
  shareability: number
  /** Can it land a strong, credible guest? */
  guest_potential: number
  /** Sponsor fit without cheapening the brand. */
  sponsor_appeal: number
  /** Lasting value — still worth watching in years. */
  timeless_value: number
  /** Relevance to KSA / Kuwait / Iraq / GCC specifically. */
  regional_relevance: number
  /** Appeal to an international audience. */
  global_relevance: number
  /** Alignment with Khat's identity + quality bar (also a gate). */
  brand_alignment: number
  /** Freshness — not the tired framing everyone uses. */
  originality: number
  /** Intellectual + emotional depth on offer. */
  depth: number
  /** How well-judged the risk is — bold but responsible scores high; reckless OR bland scores low. */
  risk_calibration: number
  /** How feasible to produce well (guest reach, research load, sensitivity). */
  production_feasibility: number
}

export type SuccessDimension = keyof SuccessDimensions

/**
 * Priority-weighted. Click + retention lead (they make or break a podcast),
 * then the conversation + regional pull, then brand / originality / depth, then
 * the reach + guest + timeless signals, with sponsor / feasibility / risk as
 * lighter modifiers. Sum need not be 1 — the composite normalizes by it.
 */
export const SUCCESS_WEIGHTS: Record<SuccessDimension, number> = {
  click_potential: 1.5,
  retention_potential: 1.5,
  discussion_potential: 1.25,
  regional_relevance: 1.2,
  brand_alignment: 1.15,
  originality: 1.1,
  depth: 1.1,
  guest_potential: 1.05,
  shareability: 1.0,
  timeless_value: 0.95,
  global_relevance: 0.9,
  risk_calibration: 0.7,
  sponsor_appeal: 0.6,
  production_feasibility: 0.6,
}

const WEIGHT_SUM = Object.values(SUCCESS_WEIGHTS).reduce((a, b) => a + b, 0)
const DIMENSIONS = Object.keys(SUCCESS_WEIGHTS) as SuccessDimension[]

/** Default acceptance bar (0-100). Candidates below this are rejected/regenerated. */
export const SUCCESS_THRESHOLD = 58

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
 * The composite success probability in [0, 100]. Brand alignment doubles as a
 * gate: an idea that betrays Khat's quality bar (brand_alignment ≤ 3) is pulled
 * down hard so a cheap-but-clickable idea can't win the ranking.
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

/** A label band for the UI (color + words). */
export function successBand(score: number): SuccessBand {
  if (score >= 82) return "exceptional"
  if (score >= 70) return "strong"
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
  click_potential: "جذب النقرة",
  retention_potential: "بقاء المشاهد",
  discussion_potential: "إثارة النقاش",
  shareability: "قابلية المشاركة",
  guest_potential: "قوة الضيف المحتمل",
  sponsor_appeal: "جاذبية الرعاية",
  timeless_value: "قيمة تدوم",
  regional_relevance: "صلة خليجية",
  global_relevance: "صلة عالمية",
  brand_alignment: "انسجام مع خط",
  originality: "أصالة",
  depth: "عمق",
  risk_calibration: "اتزان الجرأة",
  production_feasibility: "قابلية الإنتاج",
}
