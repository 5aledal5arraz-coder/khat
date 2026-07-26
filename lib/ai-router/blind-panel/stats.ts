/**
 * Blind judgment panel — the arithmetic, as pure functions.
 *
 * Separated from storage and UI on purpose: these numbers decide whether a
 * model gets adopted, so they have to be unit-testable without a database,
 * a browser, or an AI call. Nothing here does IO.
 *
 * The panel exists because the deterministic benchmark suite
 * (lib/ai-router/benchmark/) measures COMPLIANCE and HONESTY — planted-fact
 * extraction, needle recall, citation, consistency, cost, latency. It cannot
 * measure whether an Arabic title is any good. That judgment has one
 * qualified instrument, and it is Khaled. This module turns his 20 blind
 * choices into a decision, and — separately, at zero weight — scores the
 * model judge against him.
 *
 * ── The pre-registered stopping rule ────────────────────────────────────────
 * Written BEFORE any data was collected, which is the only thing that makes
 * it a rule rather than a rationalisation. On 20 pairs, by the larger side:
 *     ≥ 14   → a clear difference
 *     ≤ 12   → no difference we can detect; stay on the current model
 *       13   → the single ambiguous case, and the only one worth 20 more
 *
 * Ties count toward NEITHER side, so they push the result toward "no
 * difference". That is the conservative direction: "these are the same" is
 * the hypothesis we are trying to hold, and a judge who cannot separate two
 * outputs is evidence for it, not missing data.
 */

// Verdict/source/section types live in `types.ts` (no runtime, no imports) so
// client components can reach them without touching `store.ts` → `pg`.
import type { PanelSource, PanelVerdict } from "./types"
export type { PanelSource, PanelVerdict, PanelSection } from "./types"

export const PANEL_PAIR_COUNT = 20

/** Pre-registered thresholds, on the larger side out of PANEL_PAIR_COUNT. */
export const CLEAR_DIFFERENCE_AT = 14
export const NO_DIFFERENCE_AT_OR_BELOW = 12

export type PanelOutcome =
  | "clear_difference"
  | "no_difference"
  | "inconclusive"
  | "incomplete"

export interface PanelTally {
  /** Pairs judged so far. */
  decided: number
  /** Pairs in the session (PANEL_PAIR_COUNT once generated). */
  total: number
  currentWins: number
  candidateWins: number
  ties: number
  /** The larger of currentWins / candidateWins — what the rule reads. */
  leaderCount: number
  leader: PanelSource | null
  outcome: PanelOutcome
  /** Leader's share of ALL pairs, as a percentage (ties in the denominator). */
  leaderSharePct: number
  /**
   * 95% CI half-width on that share, in percentage points, at the
   * maximum-variance proportion (p=0.5). This is the honest headline number:
   * it does not shrink just because the observed split looks lopsided.
   */
  marginPct: number
  /** Two-sided sign-test p-value over the NON-tied pairs. */
  pValue: number
  /** Non-tied pairs — the sign test's real sample size. */
  signTestN: number
}

export interface JudgeAgreement {
  /** Pairs where both the model judge and the human recorded a verdict. */
  comparable: number
  /** Of those, how many matched exactly (including tie-vs-tie). */
  agreed: number
  /** agreed / comparable as a percentage, or null when nothing is comparable. */
  agreementPct: number | null
  /**
   * Agreement expected from guessing, given the human's own verdict mix.
   * Without this, a judge that always says "a" against a human who says "a"
   * 60% of the time scores 60% and looks informative.
   */
  chancePct: number | null
}

// ─── Binomial helpers ────────────────────────────────────────────────────────

/** C(n, k) — exact for the n ≤ 20 this panel uses; no factorial overflow. */
export function binomialCoefficient(n: number, k: number): number {
  if (k < 0 || k > n) return 0
  const kk = Math.min(k, n - k)
  let result = 1
  for (let i = 1; i <= kk; i++) result = (result * (n - kk + i)) / i
  return result
}

/** P(X = k) for X ~ Binomial(n, 0.5). */
export function binomialPmfHalf(n: number, k: number): number {
  if (n < 0 || k < 0 || k > n) return 0
  return binomialCoefficient(n, k) * Math.pow(0.5, n)
}

/**
 * Two-sided sign test. `a` and `b` are the two sides' win counts; ties are
 * excluded by the caller (that is what a sign test does with them).
 *
 * Reported alongside the pre-registered rule, never instead of it. They
 * answer different questions and they do NOT agree at the edges: 14–6 is a
 * "clear difference" by the rule but p ≈ 0.115, i.e. not significant at the
 * conventional 0.05. That disagreement is real and is surfaced in the UI
 * rather than smoothed over — the rule is a decision procedure chosen in
 * advance to bound how long we spend judging, not a significance test.
 */
export function signTestP(a: number, b: number): number {
  const n = a + b
  if (n === 0) return 1
  const hi = Math.max(a, b)
  let tail = 0
  for (let i = hi; i <= n; i++) tail += binomialPmfHalf(n, i)
  return Math.min(1, 2 * tail)
}

/** z for a two-sided 95% interval. */
const Z_95 = 1.959964

/**
 * 95% CI half-width for a proportion over `n` trials, in percentage points,
 * evaluated at p = 0.5 (maximum variance).
 *
 * At n = 20 this is ±21.9 points — the number printed on the panel. It is
 * why 20 pairs cannot resolve a small difference and why the stopping rule
 * refuses to chase one: a 12–8 split (60%) has an interval of roughly
 * 38%–82%, which contains 50% comfortably.
 */
export function marginOfErrorPct(n: number): number {
  if (n <= 0) return 0
  return Z_95 * Math.sqrt(0.25 / n) * 100
}

// ─── Tally ───────────────────────────────────────────────────────────────────

export interface PanelPairResult {
  /** Which source sat in slot A for this pair. */
  aSource: PanelSource
  /** The human's verdict, or null if not judged yet. */
  verdict: PanelVerdict | null
  /** The model judge's verdict in the same A/B frame, or null. */
  judgeVerdict?: PanelVerdict | null
}

/** Translate an A/B verdict into which SOURCE it favoured. */
export function verdictToSource(
  verdict: PanelVerdict,
  aSource: PanelSource,
): PanelSource | null {
  if (verdict === "tie") return null
  const bSource: PanelSource = aSource === "current" ? "candidate" : "current"
  return verdict === "a" ? aSource : bSource
}

export function tallyPanel(pairs: PanelPairResult[]): PanelTally {
  const total = pairs.length
  let currentWins = 0
  let candidateWins = 0
  let ties = 0
  let decided = 0

  for (const p of pairs) {
    if (!p.verdict) continue
    decided++
    const winner = verdictToSource(p.verdict, p.aSource)
    if (winner === "current") currentWins++
    else if (winner === "candidate") candidateWins++
    else ties++
  }

  const leaderCount = Math.max(currentWins, candidateWins)
  const leader: PanelSource | null =
    currentWins === candidateWins ? null : currentWins > candidateWins ? "current" : "candidate"

  let outcome: PanelOutcome
  if (decided < total || total === 0) {
    // The rule is defined on a COMPLETE panel. Reading it early is how a
    // stopping rule becomes optional stopping — the exact bias it prevents.
    outcome = "incomplete"
  } else if (leaderCount >= CLEAR_DIFFERENCE_AT) {
    outcome = "clear_difference"
  } else if (leaderCount <= NO_DIFFERENCE_AT_OR_BELOW) {
    outcome = "no_difference"
  } else {
    outcome = "inconclusive"
  }

  return {
    decided,
    total,
    currentWins,
    candidateWins,
    ties,
    leaderCount,
    leader,
    outcome,
    leaderSharePct: total > 0 ? (leaderCount / total) * 100 : 0,
    marginPct: marginOfErrorPct(total),
    pValue: signTestP(currentWins, candidateWins),
    signTestN: currentWins + candidateWins,
  }
}

// ─── Judge agreement (weight: zero) ──────────────────────────────────────────

/**
 * How often the model judge matched the human — measured, and deliberately
 * given NO influence on the outcome above.
 *
 * The point is inverted from the usual one. We are not asking the judge to
 * rate the models; we are using Khaled's verdicts to rate the JUDGE, because
 * the same judge model scores every automated benchmark and nobody has ever
 * checked it against the one opinion that matters. A judge that lands near
 * chance here is evidence that `quality_net` in model_benchmarks is noise
 * with a decimal point on it.
 */
export function judgeAgreement(pairs: PanelPairResult[]): JudgeAgreement {
  let comparable = 0
  let agreed = 0
  const humanCounts: Record<PanelVerdict, number> = { a: 0, b: 0, tie: 0 }
  const judgeCounts: Record<PanelVerdict, number> = { a: 0, b: 0, tie: 0 }

  for (const p of pairs) {
    if (!p.verdict || !p.judgeVerdict) continue
    comparable++
    humanCounts[p.verdict]++
    judgeCounts[p.judgeVerdict]++
    if (p.verdict === p.judgeVerdict) agreed++
  }

  if (comparable === 0) {
    return { comparable: 0, agreed: 0, agreementPct: null, chancePct: null }
  }

  // Chance agreement under independence, from each side's own verdict mix.
  let chance = 0
  for (const v of ["a", "b", "tie"] as PanelVerdict[]) {
    chance += (humanCounts[v] / comparable) * (judgeCounts[v] / comparable)
  }

  return {
    comparable,
    agreed,
    agreementPct: (agreed / comparable) * 100,
    chancePct: chance * 100,
  }
}
