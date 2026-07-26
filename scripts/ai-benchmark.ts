/**
 * Model benchmark CLI — run the upgrade-evidence suite inline (no worker).
 *
 *   npx tsx scripts/ai-benchmark.ts --candidate gpt-5.7-sol [--tier flagship] [--baseline gpt-5.6-sol]
 *   npx tsx scripts/ai-benchmark.ts --candidate gemini-3.6-flash --candidate-provider gemini [--tier efficient]
 *   npx tsx scripts/ai-benchmark.ts --list
 *   npx tsx scripts/ai-benchmark.ts --set-threshold minQualityNet=10 [--set-threshold maxCostIncreasePct=20]
 *
 * Makes ~20 live AI calls per run (both models + blind pairwise judges).
 * Results land in model_benchmarks and render in Settings → الذكاء الاصطناعي.
 * Strategy: docs/ai-model-benchmarks.md
 */

import "@/lib/jobs/load-env"
import {
  runModelBenchmark,
  tierForCandidate,
  tierBaselineModel,
  providerForModel,
  SUITE_VERSION,
} from "@/lib/ai-router/benchmark/run"
import {
  listModelBenchmarks,
  readBenchmarkThresholds,
  writeBenchmarkThreshold,
} from "@/lib/ai-router/benchmark/store"
import {
  DEFAULT_THRESHOLDS,
  type BenchmarkThresholds,
  type DimensionScore,
  type BenchmarkSummary,
} from "@/lib/ai-router/benchmark/scoring"
import type { BenchmarkTier } from "@/lib/db/schema/model-benchmarks"
import { AI_PROVIDERS, type AiProvider } from "@/lib/db/schema/ai-runs"

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? (process.argv[i + 1] ?? null) : null
}
function args(name: string): string[] {
  const out: string[] = []
  process.argv.forEach((a, i) => {
    if (a === `--${name}` && process.argv[i + 1]) out.push(process.argv[i + 1])
  })
  return out
}

const fmtDelta = (n: number | null, unit = "") =>
  n === null ? "؟" : `${n >= 0 ? "+" : ""}${n.toFixed(1)}${unit}`

function printScorecard(item: {
  tier: string
  baseline_model: string
  candidate_model: string
  status: string
  scores: unknown
  summary: unknown
  created_at?: string
  completed_at?: string | null
  error?: string | null
}) {
  console.log(
    `\n■ ${item.candidate_model} vs ${item.baseline_model}  (${item.tier}, ${SUITE_VERSION})` +
      `  [${item.status}]  ${item.completed_at ?? item.created_at ?? ""}`,
  )
  if (item.error) console.log(`  error: ${item.error}`)
  const dims = (item.scores as { dimensions?: DimensionScore[] } | null)?.dimensions
  if (dims) {
    for (const d of dims) {
      const fmt = (v: number | null) =>
        v === null ? "—" : d.unit === "usd" ? `$${v.toFixed(4)}` : d.unit === "ms" ? `${Math.round(v)}ms` : String(Math.round(v))
      console.log(
        `  ${d.key.padEnd(17)} baseline=${fmt(d.baseline).padEnd(9)} candidate=${fmt(d.candidate).padEnd(9)} Δ=${fmtDelta(d.delta, d.kind === "measured" ? "%" : "")}${d.note ? `  (${d.note})` : ""}`,
      )
    }
  }
  const s = item.summary as BenchmarkSummary | null
  if (s) {
    console.log(
      `  → ${s.recommendation === "upgrade" ? "⬆ UPGRADE" : "⏸ KEEP CURRENT"}` +
        `${s.rule ? ` (${s.rule})` : ""}  quality_net=${fmtDelta(s.quality_net)} accuracy=${fmtDelta(s.accuracy_delta_pp, "pp")} cost=${fmtDelta(s.cost_delta_pct, "%")} latency=${fmtDelta(s.latency_delta_pct, "%")}`,
    )
    for (const r of s.reasons) console.log(`    • ${r}`)
  }
}

async function main() {
  const sets = args("set-threshold")
  if (sets.length > 0) {
    let latest: BenchmarkThresholds | null = null
    for (const kv of sets) {
      const [k, v] = kv.split("=")
      if (!(k in DEFAULT_THRESHOLDS)) throw new Error(`Unknown threshold "${k}"`)
      const key = k as keyof BenchmarkThresholds
      latest = await writeBenchmarkThreshold(
        key,
        key === "autoBenchmark" ? v === "true" : Number(v),
      )
      console.log(`set ${k} = ${v}`)
    }
    console.log("thresholds now:", JSON.stringify(latest, null, 2))
    return
  }

  if (process.argv.includes("--list")) {
    const rows = await listModelBenchmarks(10)
    if (rows.length === 0) console.log("No benchmarks recorded yet.")
    rows.forEach(printScorecard)
    console.log("\nthresholds:", JSON.stringify(await readBenchmarkThresholds()))
    return
  }

  const candidate = arg("candidate")
  if (!candidate) {
    console.log("Usage: --candidate <model> [--candidate-provider openai|gemini] [--tier flagship|balanced|efficient] [--baseline <model>] | --list | --set-threshold k=v")
    process.exit(2)
  }
  const tier = (arg("tier") as BenchmarkTier | null) ?? tierForCandidate(candidate)
  const baseline = arg("baseline") ?? tierBaselineModel(tier)
  // Provider of the candidate model. Derived from the model id when the flag
  // is omitted — the old "default to openai" meant `--candidate gemini-3.6-flash`
  // without the flag benchmarked a 404. --candidate-provider still overrides.
  const providerArg = arg("candidate-provider")
  if (providerArg && !AI_PROVIDERS.includes(providerArg as AiProvider)) {
    throw new Error(
      `Unknown --candidate-provider "${providerArg}" (expected: ${AI_PROVIDERS.join(", ")})`,
    )
  }
  const candidateProvider = (providerArg as AiProvider | null) ?? providerForModel(candidate)
  console.log(
    `Benchmarking ${candidate} (${candidateProvider}) vs ${baseline} (${tier}) — ~20 live AI calls…`,
  )
  const started = Date.now()
  const result = await runModelBenchmark({
    tier,
    candidateModel: candidate,
    baselineModel: baseline,
    candidateProvider,
    triggeredBy: "cli",
  })
  console.log(`Finished in ${Math.round((Date.now() - started) / 1000)}s → ${result.status}`)
  const [row] = await listModelBenchmarks(1)
  if (row) printScorecard(row)
  process.exit(result.status === "completed" ? 0 : 1)
}

main().catch((err) => {
  console.error("ai-benchmark failed:", err)
  process.exit(1)
})
