/**
 * Benchmark scoring — pure functions (no IO, fully unit-tested).
 *
 * Three kinds of dimensions feed one scorecard:
 *   judged        — discovery / editorial / research quality. Graded by a
 *                   BLIND pairwise judge that sees output A vs output B
 *                   twice (orders swapped, cancelling position bias);
 *                   pairwise > absolute, matching lib/evals/judge.ts.
 *   programmatic  — extraction / long-context / consistency. Graded by
 *                   exact checks against facts planted in fixtures.ts.
 *   measured      — cost / latency / token efficiency, read straight off
 *                   the ai_runs metrics of the suite calls.
 *
 * The decision is threshold-driven (config_store `ai_benchmark_thresholds`)
 * with three upgrade paths: quality-led, accuracy-led, cost-led. Anything
 * else → keep current, with operator-readable Arabic reasons.
 */

import { PLANTED_QUOTES, NEEDLES, ORDER_QUESTION } from "./fixtures"
import type { BenchmarkTier } from "@/lib/db/schema/model-benchmarks"

// ─── Thresholds ──────────────────────────────────────────────────────────────

export interface BenchmarkThresholds {
  /** Auto-run the suite for models in families newer than the defaults. */
  autoBenchmark: boolean
  /** Quality-led: min net judge preference for the candidate (−100..100). */
  minQualityNet: number
  /** Accuracy-led: min programmatic gain in percentage points. */
  minAccuracyGainPp: number
  /** Floor: programmatic score may not regress more than this (pp, ≤0). */
  minAccuracyDeltaPp: number
  /** Gates for any upgrade path. */
  maxCostIncreasePct: number
  maxLatencyIncreasePct: number
  /** Cost-led: min measured cost saving (%). */
  minCostSavingPct: number
  /** Floor: consistency may not regress more than this (pp, ≤0). */
  minConsistencyDeltaPp: number
}

export const DEFAULT_THRESHOLDS: BenchmarkThresholds = {
  autoBenchmark: true,
  minQualityNet: 8,
  minAccuracyGainPp: 5,
  minAccuracyDeltaPp: -2,
  maxCostIncreasePct: 30,
  maxLatencyIncreasePct: 75,
  minCostSavingPct: 25,
  minConsistencyDeltaPp: -10,
}

// ─── Dimension weights per tier ──────────────────────────────────────────────

export const JUDGED_WEIGHTS: Record<BenchmarkTier, Record<JudgedKey, number>> = {
  flagship: { discovery: 0.4, editorial: 0.4, research: 0.2 },
  balanced: { discovery: 0.2, editorial: 0.3, research: 0.5 },
  efficient: { discovery: 0.34, editorial: 0.33, research: 0.33 },
}

export const PROGRAMMATIC_WEIGHTS: Record<
  BenchmarkTier,
  Record<ProgrammaticKey, number>
> = {
  flagship: { extraction: 0.4, long_context: 0.4, consistency: 0.2 },
  balanced: { extraction: 0.3, long_context: 0.5, consistency: 0.2 },
  efficient: { extraction: 0.45, long_context: 0.3, consistency: 0.25 },
}

export type JudgedKey = "discovery" | "editorial" | "research"
export type ProgrammaticKey = "extraction" | "long_context" | "consistency"
export type MeasuredKey = "cost" | "latency" | "token_efficiency"
export type DimensionKey = JudgedKey | ProgrammaticKey | MeasuredKey

// ─── Text normalization + programmatic graders ──────────────────────────────

/** Strip tashkeel/tatweel + collapse whitespace + normalize digits so exact
 *  matching survives harmless formatting differences. */
export function normalizeArabic(s: string): string {
  const easternDigits = "٠١٢٣٤٥٦٧٨٩"
  return s
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/[٠-٩]/g, (d) => String(easternDigits.indexOf(d)))
    .replace(/\s+/g, " ")
    .trim()
}

function containsNormalized(haystack: string, needle: string): boolean {
  return normalizeArabic(haystack).includes(normalizeArabic(needle))
}

export interface ExtractionOutput {
  chapters?: Array<{ title?: unknown }>
  quotes?: unknown[]
  guest_name?: unknown
}

/** Extraction accuracy 0-100 from one parsed run (null parsed → 0). */
export function gradeExtraction(parsed: unknown): number {
  if (!parsed || typeof parsed !== "object") return 0
  const o = parsed as ExtractionOutput
  let score = 30 // valid JSON object at all

  const quotes = Array.isArray(o.quotes) ? o.quotes.filter((q) => typeof q === "string") : []
  const joined = quotes.join("\n")
  const found = PLANTED_QUOTES.filter((q) => containsNormalized(joined, q)).length
  score += Math.round((found / PLANTED_QUOTES.length) * 40)

  const chapterCount = Array.isArray(o.chapters) ? o.chapters.length : 0
  if (chapterCount >= 3 && chapterCount <= 8) score += 15

  if (typeof o.guest_name === "string" && containsNormalized(o.guest_name, "سالم الراشد")) {
    score += 15
  }
  return Math.min(100, score)
}

/** Consistency 0-100 across N repeated extraction runs. */
export function gradeConsistency(parsedRuns: unknown[]): number {
  if (parsedRuns.length === 0) return 0
  const valid = parsedRuns.filter((p) => p && typeof p === "object") as ExtractionOutput[]
  const validRate = valid.length / parsedRuns.length
  let score = validRate * 50

  if (valid.length >= 2) {
    const counts = valid.map((o) => (Array.isArray(o.chapters) ? o.chapters.length : 0))
    const mean = counts.reduce((a, b) => a + b, 0) / counts.length
    const sd = Math.sqrt(counts.reduce((a, b) => a + (b - mean) ** 2, 0) / counts.length)
    // sd 0 → full points; sd ≥ 2 chapters → none.
    score += Math.max(0, 1 - sd / 2) * 25

    const recalls = valid.map((o) => {
      const joined = (Array.isArray(o.quotes) ? o.quotes : []).filter((q) => typeof q === "string").join("\n")
      return PLANTED_QUOTES.filter((q) => containsNormalized(joined, q)).length
    })
    const stable = recalls.every((r) => r === recalls[0])
    score += stable ? 25 : Math.max(0, 25 - 12.5 * (Math.max(...recalls) - Math.min(...recalls)))
  } else if (valid.length === 1) {
    score += 0 // one valid run says nothing about stability
  }
  return Math.round(Math.min(100, score))
}

export interface LongContextOutput {
  answers?: unknown[]
}

/** Long-context 0-100: 5 needle answers (16pt each) + ordering (20pt). */
export function gradeLongContext(parsed: unknown): number {
  if (!parsed || typeof parsed !== "object") return 0
  const answers = (parsed as LongContextOutput).answers
  if (!Array.isArray(answers)) return 0
  let score = 0
  NEEDLES.forEach((needle, i) => {
    const a = answers[i]
    if (typeof a === "string" && containsNormalized(a, needle.expected)) score += 16
  })
  const orderAnswer = answers[NEEDLES.length]
  if (typeof orderAnswer === "string" && containsNormalized(orderAnswer, ORDER_QUESTION.expected)) {
    score += 20
  }
  return Math.min(100, score)
}

// ─── Pairwise judge aggregation ──────────────────────────────────────────────

export type JudgeVerdict = "A" | "B" | "tie"

/**
 * Combine two blind judge calls (call 1: candidate=A; call 2: candidate=B,
 * i.e. order swapped) into the candidate's win share 0..1.
 */
export function candidateWinShare(
  callCandidateIsA: JudgeVerdict,
  callCandidateIsB: JudgeVerdict,
): number {
  const share = (v: JudgeVerdict, candidateSide: "A" | "B") =>
    v === "tie" ? 0.5 : v === candidateSide ? 1 : 0
  return (share(callCandidateIsA, "A") + share(callCandidateIsB, "B")) / 2
}

// ─── Scorecard assembly + decision ───────────────────────────────────────────

export interface DimensionScore {
  key: DimensionKey
  kind: "judged" | "programmatic" | "measured"
  /** judged: judge-preference %; programmatic: 0-100; measured: raw unit. */
  baseline: number | null
  candidate: number | null
  /** judged/programmatic: candidate − baseline (pp); measured: % change. */
  delta: number | null
  unit: "score" | "usd" | "ms" | "tokens"
  note?: string
}

export interface BenchmarkAggregates {
  quality_net: number | null
  accuracy_delta_pp: number | null
  consistency_delta_pp: number | null
  cost_delta_pct: number | null
  latency_delta_pct: number | null
  token_ratio: number | null
}

export interface BenchmarkSummary extends BenchmarkAggregates {
  recommendation: "upgrade" | "keep_current"
  rule: "quality_led" | "accuracy_led" | "cost_led" | null
  reasons: string[]
}

export interface ScorecardInput {
  tier: BenchmarkTier
  /** Candidate win share 0..1 per judged task (null = task failed both sides). */
  judged: Record<JudgedKey, number | null>
  /** 0-100 per model per programmatic task. */
  programmatic: Record<ProgrammaticKey, { baseline: number; candidate: number }>
  measured: {
    cost: { baseline: number | null; candidate: number | null }
    latencyMs: { baseline: number; candidate: number }
    tokensOut: { baseline: number; candidate: number }
  }
}

const pct = (base: number, cand: number): number | null =>
  base > 0 ? ((cand - base) / base) * 100 : null

export function buildScorecard(input: ScorecardInput): {
  dimensions: DimensionScore[]
  aggregates: BenchmarkAggregates
} {
  const dims: DimensionScore[] = []

  // Judged dimensions — display as judge-preference percentages.
  const jw = JUDGED_WEIGHTS[input.tier]
  let jWeighted = 0
  let jWeightSum = 0
  for (const key of Object.keys(jw) as JudgedKey[]) {
    const share = input.judged[key]
    if (share === null) {
      dims.push({ key, kind: "judged", baseline: null, candidate: null, delta: null, unit: "score", note: "فشل الطرفان في المهمة" })
      continue
    }
    const cand = share * 100
    dims.push({ key, kind: "judged", baseline: 100 - cand, candidate: cand, delta: cand - (100 - cand), unit: "score" })
    jWeighted += (share - 0.5) * 200 * jw[key]
    jWeightSum += jw[key]
  }
  const quality_net = jWeightSum > 0 ? jWeighted / jWeightSum : null

  // Programmatic dimensions.
  const pw = PROGRAMMATIC_WEIGHTS[input.tier]
  let pWeighted = 0
  let pWeightSum = 0
  for (const key of Object.keys(pw) as ProgrammaticKey[]) {
    const { baseline, candidate } = input.programmatic[key]
    dims.push({ key, kind: "programmatic", baseline, candidate, delta: candidate - baseline, unit: "score" })
    pWeighted += (candidate - baseline) * pw[key]
    pWeightSum += pw[key]
  }
  const accuracy_delta_pp = pWeightSum > 0 ? pWeighted / pWeightSum : null
  const consistency_delta_pp =
    input.programmatic.consistency.candidate - input.programmatic.consistency.baseline

  // Measured dimensions.
  const { cost, latencyMs, tokensOut } = input.measured
  const cost_delta_pct =
    cost.baseline !== null && cost.candidate !== null ? pct(cost.baseline, cost.candidate) : null
  dims.push({
    key: "cost",
    kind: "measured",
    baseline: cost.baseline,
    candidate: cost.candidate,
    delta: cost_delta_pct,
    unit: "usd",
    ...(cost.baseline === null || cost.candidate === null
      ? { note: "تسعيرة غير معروفة لأحد النموذجين — أضفها في التخصيص" }
      : {}),
  })
  const latency_delta_pct = pct(latencyMs.baseline, latencyMs.candidate)
  dims.push({ key: "latency", kind: "measured", baseline: latencyMs.baseline, candidate: latencyMs.candidate, delta: latency_delta_pct, unit: "ms" })
  const token_ratio = tokensOut.baseline > 0 ? tokensOut.candidate / tokensOut.baseline : null
  dims.push({
    key: "token_efficiency",
    kind: "measured",
    baseline: tokensOut.baseline,
    candidate: tokensOut.candidate,
    delta: token_ratio !== null ? (token_ratio - 1) * 100 : null,
    unit: "tokens",
  })

  return {
    dimensions: dims,
    aggregates: { quality_net, accuracy_delta_pp, consistency_delta_pp, cost_delta_pct, latency_delta_pct, token_ratio },
  }
}

export function decide(
  a: BenchmarkAggregates,
  t: BenchmarkThresholds,
): Pick<BenchmarkSummary, "recommendation" | "rule" | "reasons"> {
  const reasons: string[] = []
  const fmt = (n: number | null, unit = "") => (n === null ? "غير معروف" : `${n.toFixed(1)}${unit}`)

  const costOk = a.cost_delta_pct === null || a.cost_delta_pct <= t.maxCostIncreasePct
  const latencyOk = a.latency_delta_pct === null || a.latency_delta_pct <= t.maxLatencyIncreasePct
  const consistencyOk =
    a.consistency_delta_pp === null || a.consistency_delta_pp >= t.minConsistencyDeltaPp
  const accuracyFloorOk =
    a.accuracy_delta_pp === null || a.accuracy_delta_pp >= t.minAccuracyDeltaPp

  if (!costOk) reasons.push(`الكلفة ارتفعت ${fmt(a.cost_delta_pct, "%")} (الحد ${t.maxCostIncreasePct}%)`)
  if (!latencyOk) reasons.push(`زمن الاستجابة ارتفع ${fmt(a.latency_delta_pct, "%")} (الحد ${t.maxLatencyIncreasePct}%)`)
  if (!consistencyOk) reasons.push(`ثبات المخرجات تراجع ${fmt(a.consistency_delta_pp, " نقطة")}`)
  if (!accuracyFloorOk) reasons.push(`الدقة البرمجية تراجعت ${fmt(a.accuracy_delta_pp, " نقطة")}`)

  const gates = costOk && latencyOk && consistencyOk

  if (gates && accuracyFloorOk && a.quality_net !== null && a.quality_net >= t.minQualityNet) {
    reasons.unshift(`الحكم الأعمى فضّل المرشح بصافي ${fmt(a.quality_net)} (الحد ${t.minQualityNet})`)
    return { recommendation: "upgrade", rule: "quality_led", reasons }
  }
  if (
    gates &&
    a.accuracy_delta_pp !== null &&
    a.accuracy_delta_pp >= t.minAccuracyGainPp &&
    (a.quality_net === null || a.quality_net >= -5)
  ) {
    reasons.unshift(`الدقة البرمجية تحسنت ${fmt(a.accuracy_delta_pp, " نقطة")} (الحد ${t.minAccuracyGainPp})`)
    return { recommendation: "upgrade", rule: "accuracy_led", reasons }
  }
  if (
    gates &&
    accuracyFloorOk &&
    a.cost_delta_pct !== null &&
    a.cost_delta_pct <= -t.minCostSavingPct &&
    (a.quality_net === null || a.quality_net >= 0)
  ) {
    reasons.unshift(`وفر في الكلفة ${fmt(-a.cost_delta_pct, "%")} دون تراجع في الجودة`)
    return { recommendation: "upgrade", rule: "cost_led", reasons }
  }

  if (a.quality_net !== null && a.quality_net < t.minQualityNet) {
    reasons.push(`صافي تفضيل الحكم ${fmt(a.quality_net)} دون حد الترقية (${t.minQualityNet})`)
  }
  if (reasons.length === 0) reasons.push("لا تحسن كافٍ يبرر الترقية وفق العتبات الحالية")
  return { recommendation: "keep_current", rule: null, reasons }
}
