/**
 * Khat Brain — Evaluation framework types.
 *
 * Phase 0. Provider-agnostic shapes that every feature's golden set,
 * judge prompt, and report adhere to. Keep this file small — it's the
 * contract every later phase relies on.
 */

export const GOLDEN_SCHEMA_VERSION = "v1"

export type EvalFeature =
  | "hybrid-topics"
  | "original-thinking"
  | "studio-package"

export const EVAL_FEATURES: readonly EvalFeature[] = [
  "hybrid-topics",
  "original-thinking",
  "studio-package",
] as const

/**
 * Provenance tells us why an entry is allowed in the golden set.
 *
 *   real-episode-<n>       — pulled from config/episode-cache.json
 *   real-candidate-<id>    — pulled from a khat_map_episode_candidates row
 *   operator-curated       — operator personally added/edited
 *   synthetic-rule-driven  — generated as a deliberate rule violation
 */
export type GoldenSource =
  | `real-episode-${number}`
  | `real-candidate-${string}`
  | "operator-curated"
  | "synthetic-rule-driven"

/**
 * The example payload is feature-specific. The eval engine treats it
 * as opaque JSON and passes it to the judge prompt verbatim. Schemas
 * for each feature live alongside the feature's golden.json (in JSDoc
 * comments) and are validated only at the judge layer.
 */
export interface GoldenEntry<T = Record<string, unknown>> {
  id: string
  source: GoldenSource
  evidence: string
  example: T
  /** Optional note from the operator about why this entry matters. */
  operator_note?: string
}

export interface GoldenSet<T = Record<string, unknown>> {
  $schema_version: typeof GOLDEN_SCHEMA_VERSION
  feature: EvalFeature
  language: "ar" | "en"
  description: string
  positive: GoldenEntry<T>[]
  negative: GoldenEntry<T>[]
}

/** One judge ranking — model places a candidate among positives. */
export interface JudgeRanking {
  candidate_id: string
  /** 1-based rank inside the combined [candidates, positives] pool. */
  rank: number
  /** One-sentence justification. */
  reason: string
}

export interface JudgeOutput {
  rankings: JudgeRanking[]
  /** Free-form notes the judge wants to surface. */
  notes?: string
}

/** Per-run report written to evals/results/<feature>/<timestamp>.json. */
export interface EvalReport {
  feature: EvalFeature
  timestamp: string
  prompt_version: string | null
  /** Hash of the golden set used (so we can detect drift). */
  golden_hash: string
  /** Number of positives in the golden set. */
  positive_count: number
  /** Number of candidates produced by the generator. */
  candidate_count: number
  /**
   * Normalized quality score in [0, 1]. Higher is better. Computed
   * from mean rank of generated candidates among positives.
   */
  quality_score: number
  /** Raw judge output for audit + debugging. */
  judge: JudgeOutput
  /** Notes from the eval engine itself (config used, model used, etc.). */
  meta: {
    judge_model: string
    judge_provider: string
    runner_version: string
  }
}
