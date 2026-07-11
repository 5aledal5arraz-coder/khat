/**
 * Benchmark persistence — model_benchmarks rows + thresholds config.
 *
 * Thresholds live in config_store under `ai_benchmark_thresholds` (same
 * mechanism as the model overrides): partial JSON merged over
 * DEFAULT_THRESHOLDS, so operators only store what they change.
 * Edit via `npm run ai:benchmark -- --set-threshold key=value`.
 */

import { desc, eq, and } from "drizzle-orm"
import { db } from "@/lib/db"
import { configStore } from "@/lib/db/schema/system"
import {
  modelBenchmarks,
  type BenchmarkTier,
  type BenchmarkStatus,
} from "@/lib/db/schema/model-benchmarks"
import { DEFAULT_THRESHOLDS, type BenchmarkThresholds } from "./scoring"

const THRESHOLDS_KEY = "ai_benchmark_thresholds"

export async function readBenchmarkThresholds(): Promise<BenchmarkThresholds> {
  if (!db) return { ...DEFAULT_THRESHOLDS }
  try {
    const rows = await db
      .select({ value: configStore.value })
      .from(configStore)
      .where(eq(configStore.key, THRESHOLDS_KEY))
      .limit(1)
    const raw = (rows[0]?.value ?? {}) as Partial<BenchmarkThresholds>
    const merged = { ...DEFAULT_THRESHOLDS }
    for (const k of Object.keys(DEFAULT_THRESHOLDS) as (keyof BenchmarkThresholds)[]) {
      const v = raw[k]
      if (k === "autoBenchmark") {
        if (typeof v === "boolean") merged.autoBenchmark = v
      } else if (typeof v === "number" && Number.isFinite(v)) {
        ;(merged[k] as number) = v
      }
    }
    return merged
  } catch {
    return { ...DEFAULT_THRESHOLDS }
  }
}

export async function writeBenchmarkThreshold(
  key: keyof BenchmarkThresholds,
  value: number | boolean,
): Promise<BenchmarkThresholds> {
  if (!db) throw new Error("Database not available")
  const current = await readBenchmarkThresholds()
  const next = { ...current, [key]: value }
  await db
    .insert(configStore)
    .values({ key: THRESHOLDS_KEY, value: next })
    .onConflictDoUpdate({
      target: configStore.key,
      set: { value: next, updated_at: new Date() },
    })
  return next
}

// ─── Rows ────────────────────────────────────────────────────────────────────

export interface BenchmarkRowSeed {
  tier: BenchmarkTier
  baseline_model: string
  candidate_model: string
  suite_version: string
  triggered_by: "manual" | "auto-discovery" | "cli"
}

export async function createBenchmarkRow(seed: BenchmarkRowSeed): Promise<string> {
  if (!db) throw new Error("Database not available")
  const [row] = await db
    .insert(modelBenchmarks)
    .values({ ...seed, status: "running" })
    .returning({ id: modelBenchmarks.id })
  return row.id
}

export async function finishBenchmarkRow(
  id: string,
  patch: {
    status: BenchmarkStatus
    scores?: unknown
    summary?: unknown
    thresholds?: unknown
    judge_model?: string
    error?: string | null
  },
): Promise<void> {
  if (!db) return
  await db
    .update(modelBenchmarks)
    .set({
      status: patch.status,
      scores: patch.scores ?? null,
      summary: patch.summary ?? null,
      thresholds: patch.thresholds ?? null,
      judge_model: patch.judge_model ?? null,
      error: patch.error ?? null,
      completed_at: new Date(),
    })
    .where(eq(modelBenchmarks.id, id))
}

/** Has this exact comparison already run (or is running) for this suite? */
export async function benchmarkExists(
  candidate: string,
  baseline: string,
  suiteVersion: string,
): Promise<boolean> {
  if (!db) return false
  const rows = await db
    .select({ id: modelBenchmarks.id, status: modelBenchmarks.status })
    .from(modelBenchmarks)
    .where(
      and(
        eq(modelBenchmarks.candidate_model, candidate),
        eq(modelBenchmarks.baseline_model, baseline),
        eq(modelBenchmarks.suite_version, suiteVersion),
      ),
    )
    .limit(5)
  return rows.some((r) => r.status === "completed" || r.status === "running")
}

export interface BenchmarkListItem {
  id: string
  tier: BenchmarkTier
  baseline_model: string
  candidate_model: string
  suite_version: string
  status: BenchmarkStatus
  scores: unknown
  summary: unknown
  thresholds: unknown
  judge_model: string | null
  error: string | null
  triggered_by: string | null
  created_at: string
  completed_at: string | null
}

export async function listModelBenchmarks(limit = 10): Promise<BenchmarkListItem[]> {
  if (!db) return []
  const rows = await db
    .select()
    .from(modelBenchmarks)
    .orderBy(desc(modelBenchmarks.created_at))
    .limit(limit)
  return rows.map((r) => ({
    id: r.id,
    tier: r.tier,
    baseline_model: r.baseline_model,
    candidate_model: r.candidate_model,
    suite_version: r.suite_version,
    status: r.status,
    scores: r.scores,
    summary: r.summary,
    thresholds: r.thresholds,
    judge_model: r.judge_model,
    error: r.error,
    triggered_by: r.triggered_by,
    created_at: r.created_at.toISOString(),
    completed_at: r.completed_at ? r.completed_at.toISOString() : null,
  }))
}
