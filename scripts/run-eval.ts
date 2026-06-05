/**
 * Khat Brain — Eval CLI.
 *
 *   npm run eval -- <feature>                 # grade against current prompts
 *   npm run eval -- baseline <feature>        # grade AND record as baseline
 *   npm run eval -- list                      # list features
 *
 * The CLI orchestrates: golden-set load → live generator run → judge
 * → score → report. Reports land in evals/results/<feature>/<iso>.json.
 *
 * For Phase 0 we use the actual production generators (Hybrid,
 * Original, Discovery, Studio) to produce candidates; we are NOT
 * mocking them. That means an eval run uses real OpenAI calls and
 * is gated by OPENAI_API_KEY.
 *
 * If the API key is absent or a generator fails, the CLI writes a
 * `report.status = "error"` row so the failure itself becomes
 * tracked telemetry.
 */

import {
  EVAL_FEATURES,
  loadGoldenSet,
  hashGoldenSet,
  callJudge,
  scoreEval,
  shufflePool,
  writeReport,
  writeBaseline,
  type EvalFeature,
  type EvalReport,
  type RankPoolItem,
} from "../lib/evals"
import { runGenerator } from "../lib/evals/runners"

const RUNNER_VERSION = "phase0-runner-v1.0"

interface CliArgs {
  mode: "grade" | "baseline" | "list"
  feature?: EvalFeature
}

function parseArgs(argv: string[]): CliArgs {
  const args = argv.slice(2)
  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    return { mode: "list" }
  }
  if (args[0] === "list") return { mode: "list" }
  if (args[0] === "baseline") {
    const feature = args[1] as EvalFeature
    if (!isFeature(feature)) {
      throw new Error(`Unknown feature "${feature}". Try: npm run eval -- list`)
    }
    return { mode: "baseline", feature }
  }
  const feature = args[0] as EvalFeature
  if (!isFeature(feature)) {
    throw new Error(`Unknown feature "${feature}". Try: npm run eval -- list`)
  }
  return { mode: "grade", feature }
}

function isFeature(v: string): v is EvalFeature {
  return (EVAL_FEATURES as readonly string[]).includes(v)
}

async function main() {
  const args = parseArgs(process.argv)

  if (args.mode === "list") {
    console.log("Available features:")
    for (const f of EVAL_FEATURES) console.log("  • " + f)
    console.log("\nUsage:")
    console.log("  npm run eval -- <feature>            # grade vs current prompts")
    console.log("  npm run eval -- baseline <feature>   # grade AND record baseline")
    process.exit(0)
  }

  const feature = args.feature!
  console.log(`[eval] feature=${feature} mode=${args.mode}`)
  console.log(`[eval] runner_version=${RUNNER_VERSION}`)

  const goldenSet = await loadGoldenSet(feature)
  const goldenHash = hashGoldenSet(goldenSet)
  console.log(`[eval] golden_hash=${goldenHash} positives=${goldenSet.positive.length} negatives=${goldenSet.negative.length}`)

  // 1. Generate candidates via the production generator.
  let generated: { candidates: Array<{ id: string; example: Record<string, unknown> }>; promptVersion: string | null }
  try {
    generated = await runGenerator(feature)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[eval] generator failed: ${message}`)
    process.exit(2)
  }
  console.log(`[eval] generator produced ${generated.candidates.length} candidates (prompt_version=${generated.promptVersion})`)

  // 2. Build the rank pool (candidates + positives).
  const pool: RankPoolItem[] = [
    ...generated.candidates.map((c) => ({ id: c.id, example: c.example, _kind: "candidate" as const })),
    ...goldenSet.positive.map((p) => ({ id: p.id, example: p.example as Record<string, unknown>, _kind: "positive" as const })),
  ]
  const shuffled = shufflePool(pool, goldenHash + feature)

  // 3. Call the judge.
  let judge
  try {
    judge = await callJudge({
      feature,
      goldenSet,
      candidateIds: generated.candidates.map((c) => c.id),
      pool: shuffled,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[eval] judge failed: ${message}`)
    process.exit(3)
  }
  console.log(`[eval] judge ranked ${judge.output.rankings.length} items (run_id=${judge.runId})`)

  // 4. Score.
  const scored = scoreEval({
    candidateIds: generated.candidates.map((c) => c.id),
    rankings: judge.output.rankings,
    goldenSet,
  })

  const report: EvalReport = {
    feature,
    timestamp: new Date().toISOString(),
    prompt_version: generated.promptVersion,
    golden_hash: goldenHash,
    positive_count: goldenSet.positive.length,
    candidate_count: generated.candidates.length,
    quality_score: scored.quality_score,
    judge: judge.output,
    meta: {
      judge_model: "gpt-4o-mini",
      judge_provider: "openai",
      runner_version: RUNNER_VERSION,
    },
  }

  const reportPath = await writeReport(report)
  console.log(`[eval] wrote ${reportPath}`)
  console.log(`[eval] quality_score=${scored.quality_score}`)

  if (args.mode === "baseline") {
    await writeBaseline({
      feature,
      prompt_version: report.prompt_version,
      golden_hash: report.golden_hash,
      quality_score: report.quality_score,
      timestamp: report.timestamp,
      source_report: reportPath,
    })
    console.log(`[eval] baseline recorded for ${feature}`)
  }

  process.exit(0)
}

main().catch((err) => {
  console.error("[eval] fatal:", err)
  process.exit(1)
})
