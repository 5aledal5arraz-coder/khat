/**
 * Model benchmark job — runs the model-upgrade benchmark suite in the
 * worker (lib/ai-router/benchmark/run.ts) so the ~20 AI calls never
 * block a request thread.
 *
 * Payload: { benchmark_id, tier, candidate_model, baseline_model } —
 * the model_benchmarks row is pre-created by the enqueuer (settings
 * action or auto-discovery scan) so the UI can show "running"
 * immediately. runModelBenchmark() itself never throws; it writes
 * completed/failed onto the row.
 */

import { registerHandler } from "../registry"
import { runModelBenchmark } from "@/lib/ai-router/benchmark/run"
import type { BenchmarkTier } from "@/lib/db/schema/model-benchmarks"

export interface ModelBenchmarkPayload {
  benchmark_id?: string
  tier?: BenchmarkTier
  candidate_model?: string
  baseline_model?: string
  triggered_by?: "manual" | "auto-discovery"
}

registerHandler<ModelBenchmarkPayload>("model.benchmark", async (payload) => {
  if (!payload.benchmark_id || !payload.tier || !payload.candidate_model) {
    throw new Error("model.benchmark: benchmark_id, tier and candidate_model are required")
  }
  const result = await runModelBenchmark({
    benchmarkId: payload.benchmark_id,
    tier: payload.tier,
    candidateModel: payload.candidate_model,
    baselineModel: payload.baseline_model,
    triggeredBy: payload.triggered_by ?? "manual",
  })
  return {
    benchmark_id: result.id,
    status: result.status,
    recommendation: result.summary?.recommendation ?? null,
  }
})
