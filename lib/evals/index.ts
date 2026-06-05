/**
 * Khat Brain — Evaluation framework public surface.
 *
 * The CLI (scripts/run-eval.ts) imports from here. Generators stay
 * decoupled — they only know about the prompt-builder modules.
 */

export {
  GOLDEN_SCHEMA_VERSION,
  EVAL_FEATURES,
  type EvalFeature,
  type GoldenSet,
  type GoldenEntry,
  type GoldenSource,
  type JudgeOutput,
  type JudgeRanking,
  type EvalReport,
} from "./types"

export { loadGoldenSet, hashGoldenSet, pathToGolden, GoldenSetError } from "./loader"
export { scoreEval, type ScorerInput, type ScorerOutput } from "./scorer"
export {
  callJudge,
  shufflePool,
  JUDGE_PROMPT_VERSION,
  type RankPoolItem,
} from "./judge"
export {
  writeReport,
  readBaselines,
  writeBaseline,
  type BaselineEntry,
} from "./reporter"
