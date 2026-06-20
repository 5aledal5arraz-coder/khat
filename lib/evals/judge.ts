/**
 * Khat Brain — Judge prompt builder + caller.
 *
 * The judge is a separate AI call (cheap structural model) that ranks
 * a combined pool of [generated candidates, golden positives] and
 * returns a 1..N rank per candidate.
 *
 * Pairwise > absolute: asking a model "rank these five items relative
 * to these reference items" produces stable signals; asking "rate
 * each on a 0–10 scale" drifts across runs.
 */

import { runAiTask } from "@/lib/ai-router"
import type {
  EvalFeature,
  GoldenSet,
  JudgeOutput,
} from "./types"

export const JUDGE_PROMPT_VERSION = "eval-judge-v1.0"

const FEATURE_INSTRUCTIONS: Record<EvalFeature, string> = {
  "hybrid-topics":
    "Each item is a hybrid topic with title, hook, conflict_angle, and market_inspiration. Reward depth, specificity of conflict, and unscrollable hooks. Penalise generic templates (how-to, 'unlock your', self-help clichés).",
  "original-thinking":
    "Each item is a lens-driven topic with title, lens, philosophical_frame, conflict, emotional_hook. Reward depth and lens-conflict alignment. Penalise self-help and templated wording.",
  "studio-package":
    "Each item is a YouTube package (title_best, alt titles, thumbnail texts, description, keywords, hashtags). Reward titles that promise concrete value and reward specificity. Penalise clickbait, vague summaries, and missing structure.",
}

export interface RankPoolItem {
  id: string
  /** What gets shown to the judge. Feature-specific shape, kept opaque. */
  example: Record<string, unknown>
  /** Hidden from judge — used only for accounting. */
  _kind: "candidate" | "positive"
}

export interface JudgeCallInput {
  feature: EvalFeature
  goldenSet: GoldenSet
  candidateIds: string[]
  /** Combined pool — order randomised before sending to judge. */
  pool: RankPoolItem[]
}

export async function callJudge(
  input: JudgeCallInput,
): Promise<{ output: JudgeOutput; runId: string }> {
  const langLabel = input.goldenSet.language === "ar" ? "Arabic" : "English"

  // Strip _kind so judge can't bias by item type.
  const sanitizedPool = input.pool.map((item) => ({
    id: item.id,
    example: item.example,
  }))

  const system = [
    `You are the editorial quality judge for the Khat Podcast eval system.`,
    `The Khat editorial bar: deep, timeless, emotionally honest, never templated.`,
    ``,
    `INSTRUCTIONS FOR THIS FEATURE (${input.feature}):`,
    FEATURE_INSTRUCTIONS[input.feature],
    ``,
    `You will receive a pool of items. Some are reference items the editorial`,
    `team has hand-picked as exemplars; others are AI-generated candidates`,
    `under evaluation. You do NOT know which is which.`,
    ``,
    `RANK every item from 1 (best) to N (worst). Two items may not share a`,
    `rank. Give a one-sentence reason for each rank.`,
    ``,
    `OUTPUT JSON ONLY:`,
    `{`,
    `  "rankings": [`,
    `    { "candidate_id": "<id>", "rank": <integer>, "reason": "<one sentence>" }`,
    `  ],`,
    `  "notes": "<optional cross-pool observation>"`,
    `}`,
  ].join("\n")

  const user = [
    `Language of items: ${langLabel}.`,
    `Pool size: ${sanitizedPool.length} items.`,
    ``,
    `ITEMS:`,
    JSON.stringify(sanitizedPool, null, 2),
    ``,
    `Return JSON only.`,
  ].join("\n")

  const result = await runAiTask<JudgeOutput>({
    taskKind: "analysis", // judge is structural — cheap model is correct here
    subjectTable: "eval_runs",
    subjectId: input.feature,
    promptVersion: JUDGE_PROMPT_VERSION,
    input: {
      feature: input.feature,
      golden_count: input.goldenSet.positive.length,
      candidate_count: input.candidateIds.length,
      pool_size: sanitizedPool.length,
    },
    prompt: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    expectJson: true,
    providerOptions: { temperature: 0.1 },
  })

  if (result.status !== "succeeded" || !result.parsed) {
    throw new Error(
      `judge call failed: ${result.errorClass ?? "unknown"} — ${result.errorMessage ?? ""}`,
    )
  }
  if (!Array.isArray(result.parsed.rankings)) {
    throw new Error("judge returned no rankings[] array")
  }

  return { output: result.parsed, runId: result.runId }
}

/**
 * Stable Fisher-Yates shuffle for the pool. Seeded for reproducibility.
 *
 * Implementation note: JS `%` keeps the sign of the dividend, so a
 * negative `h` would produce a negative `rand()` and therefore a
 * negative array index. We clamp to unsigned space after the modulo
 * so the rand() output is reliably in [0, 1).
 */
export function shufflePool(
  pool: RankPoolItem[],
  seed: string,
): RankPoolItem[] {
  const out = [...pool]
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0
  function rand() {
    h = (h * 9301 + 49297) % 233280
    if (h < 0) h += 233280
    return h / 233280
  }
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}
