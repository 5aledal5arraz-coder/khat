/**
 * Auto-discovery scan — "every newly discovered compatible model gets
 * benchmarked before anyone adopts it".
 *
 * Called from the worker at boot and every 12h: reads the live model
 * catalog, finds text models in GPT families NEWER than the ones the
 * fallback chains were written for (KNOWN_LATEST_FAMILY), maps each to
 * the tier it likely targets (suffix heuristic), and — if that exact
 * candidate/baseline/suite comparison has never run — creates a
 * model_benchmarks row and enqueues a `model.benchmark` job.
 *
 * Dedupe lives in the table itself (benchmarkExists), so restarts and
 * multiple workers can scan safely. Gated by thresholds.autoBenchmark.
 */

import { enqueueJob } from "@/lib/jobs/queue"
import {
  getModelCatalog,
  detectGptFamilies,
  newerFamilyThanKnown,
  relevantTextModels,
  KNOWN_LATEST_FAMILY,
} from "@/lib/ai-router/model-catalog"
import { SUITE_VERSION, tierForCandidate, tierBaselineModel } from "./run"
import { benchmarkExists, createBenchmarkRow, readBenchmarkThresholds } from "./store"

export async function scanForModelBenchmarks(): Promise<{
  scanned: boolean
  enqueued: Array<{ candidate: string; baseline: string; tier: string }>
}> {
  const thresholds = await readBenchmarkThresholds()
  if (!thresholds.autoBenchmark) return { scanned: false, enqueued: [] }

  const catalog = await getModelCatalog()
  if (!catalog.ids) return { scanned: false, enqueued: [] }

  const families = detectGptFamilies(catalog.ids)
  if (!newerFamilyThanKnown(families)) return { scanned: true, enqueued: [] }

  const known = Number.parseFloat(KNOWN_LATEST_FAMILY)
  const newerModels = families
    .filter((f) => Number.parseFloat(f.family) > known)
    .flatMap((f) => f.models)
    // Same relevance filter the catalog uses (defensive re-check).
    .filter((m) => relevantTextModels([m]).length === 1)

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
