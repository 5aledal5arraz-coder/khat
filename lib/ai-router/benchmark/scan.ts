/**
 * Auto-discovery scan — "every newly discovered compatible model gets
 * benchmarked before anyone adopts it".
 *
 * Called from the worker at boot and every 12h: reads the live model
 * catalogs, finds text models in families NEWER than the ones our defaults
 * were written for, maps each to the tier it likely targets (suffix
 * heuristic), and — if that exact candidate/baseline/suite comparison has
 * never run — creates a model_benchmarks row and enqueues a
 * `model.benchmark` job.
 *
 * BOTH providers are scanned. Until now only OpenAI's catalog was read, so
 * the promise above was true of GPT models and false of every other kind:
 * `tierForCandidate` had a Gemini branch that nothing could ever reach, and
 * a new Gemini release could sit on our key indefinitely without a single
 * measurement. The two version lines are unrelated number spaces, so each
 * provider is compared against its own watermark (KNOWN_LATEST_FAMILY /
 * KNOWN_LATEST_GEMINI_FAMILY) — one shared watermark would make
 * "gemini-3.6 > gpt-5.6?" a question the scan silently answers no.
 *
 * Fail-open, per provider: an unavailable catalog (no key, endpoint down)
 * contributes no candidates and never blocks the other provider's scan.
 *
 * Dedupe lives in the table itself (benchmarkExists), so restarts and
 * multiple workers can scan safely. Gated by thresholds.autoBenchmark.
 */

import { enqueueJob } from "@/lib/jobs/queue"
import {
  getModelCatalog,
  getGeminiModelCatalog,
  detectGptFamilies,
  detectGeminiFamilies,
  newerFamilyThanKnown,
  relevantTextModels,
  relevantGeminiTextModels,
  KNOWN_LATEST_FAMILY,
  KNOWN_LATEST_GEMINI_FAMILY,
  type ModelCatalog,
  type GptFamily,
} from "@/lib/ai-router/model-catalog"
import { SUITE_VERSION, tierForCandidate, tierBaselineModel } from "./run"
import { benchmarkExists, createBenchmarkRow, readBenchmarkThresholds } from "./store"

/**
 * Models from one catalog that sit in a family newer than that provider's
 * watermark. Pure apart from the catalog it is handed — unit-tested.
 */
function newerModelsIn(
  catalog: ModelCatalog,
  opts: {
    known: string
    detectFamilies: (ids: Iterable<string>) => GptFamily[]
    isRelevant: (id: string) => boolean
  },
): string[] {
  if (!catalog.ids) return []
  const families = opts.detectFamilies(catalog.ids)
  if (!newerFamilyThanKnown(families, opts.known)) return []
  const known = Number.parseFloat(opts.known)
  return families
    .filter((f) => Number.parseFloat(f.family) > known)
    .flatMap((f) => f.models)
    // Same relevance filter the catalog uses (defensive re-check).
    .filter(opts.isRelevant)
}

export async function scanForModelBenchmarks(): Promise<{
  scanned: boolean
  enqueued: Array<{ candidate: string; baseline: string; tier: string }>
}> {
  const thresholds = await readBenchmarkThresholds()
  if (!thresholds.autoBenchmark) return { scanned: false, enqueued: [] }

  const [openai, gemini] = await Promise.all([getModelCatalog(), getGeminiModelCatalog()])
  // "Scanned" means at least one catalog was readable. Both dark = we learned
  // nothing, and reporting success would make a permanent outage look calm.
  if (!openai.ids && !gemini.ids) return { scanned: false, enqueued: [] }

  const newerModels = [
    ...newerModelsIn(openai, {
      known: KNOWN_LATEST_FAMILY,
      detectFamilies: detectGptFamilies,
      isRelevant: (m) => relevantTextModels([m]).length === 1,
    }),
    ...newerModelsIn(gemini, {
      known: KNOWN_LATEST_GEMINI_FAMILY,
      detectFamilies: detectGeminiFamilies,
      isRelevant: (m) => relevantGeminiTextModels([m]).length === 1,
    }),
  ]

  const enqueued: Array<{ candidate: string; baseline: string; tier: string }> = []
  for (const candidate of newerModels) {
    const tier = tierForCandidate(candidate)
    const baseline = tierBaselineModel(tier)
    if (candidate === baseline) continue
    if (await benchmarkExists(candidate, baseline, SUITE_VERSION)) continue

    const benchmarkId = await createBenchmarkRow({
      tier,
      baseline_model: baseline,
      candidate_model: candidate,
      suite_version: SUITE_VERSION,
      triggered_by: "auto-discovery",
    })
    await enqueueJob("model.benchmark", {
      benchmark_id: benchmarkId,
      tier,
      candidate_model: candidate,
      baseline_model: baseline,
      triggered_by: "auto-discovery",
    })
    enqueued.push({ candidate, baseline, tier })
    console.log(
      `[model-benchmark] auto-discovery: enqueued ${candidate} vs ${baseline} (${tier})`,
    )
  }
  return { scanned: true, enqueued }
}
