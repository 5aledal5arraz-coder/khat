/**
 * Khat Brain — Eval scoring engine.
 *
 * Converts a judge's pairwise ranking into a normalized [0, 1] quality
 * score. The metric: mean position of generated candidates inside the
 * combined [candidates, positives] pool, mapped to [0, 1] where 1 is
 * "candidates rank at the top alongside positives" and 0 is "every
 * generated candidate sits below every positive."
 *
 * Pure math. No I/O. No model calls.
 */

import type { GoldenSet, JudgeRanking } from "./types"

export interface ScorerInput {
  /** IDs of the generated candidates (not positives). */
  candidateIds: string[]
  /** Combined ranking from the judge. */
  rankings: JudgeRanking[]
  /** The golden set whose positives were merged into the pool. */
  goldenSet: GoldenSet
}

export interface ScorerOutput {
  quality_score: number
  /** Per-candidate diagnostics. */
  per_candidate: Array<{
    id: string
    rank: number
    pool_size: number
    /** Position normalized to [0, 1] where 1 = ranked first. */
    normalized: number
  }>
}

export function scoreEval(input: ScorerInput): ScorerOutput {
  const positives = input.goldenSet.positive.map((p) => p.id)
  const poolSize = positives.length + input.candidateIds.length
  if (poolSize === 0) {
    return { quality_score: 0, per_candidate: [] }
  }

  const rankById = new Map<string, number>()
  for (const r of input.rankings) rankById.set(r.candidate_id, r.rank)

  const perCandidate = input.candidateIds.map((id) => {
    const rank = rankById.get(id) ?? poolSize // worst rank if unranked
    // normalize: rank 1 → 1.0, rank N → 0.0
    const normalized = poolSize <= 1 ? 0 : 1 - (rank - 1) / (poolSize - 1)
    return { id, rank, pool_size: poolSize, normalized }
  })

  const avgNormalized =
    perCandidate.length === 0
      ? 0
      : perCandidate.reduce((sum, p) => sum + p.normalized, 0) /
        perCandidate.length

  return {
    quality_score: round3(avgNormalized),
    per_candidate: perCandidate,
  }
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000
}
