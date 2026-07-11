/**
 * Model benchmarks — evidence for model upgrades.
 *
 * One row per benchmark run: a candidate model measured against the
 * current production (baseline) model of a tier, on the real-workload
 * suite in lib/ai-router/benchmark/. The row stores the full scorecard
 * (per-dimension scores for both models), the aggregate summary with
 * the Upgrade/Keep recommendation, and the thresholds that were in
 * force when the recommendation was computed — so a decision is always
 * auditable even after thresholds change.
 *
 * Written by the `model.benchmark` job handler (worker) or the
 * `npm run ai:benchmark` CLI; read by the admin Settings → AI panel.
 */

import { pgTable, text, jsonb, timestamp, index } from "drizzle-orm/pg-core"

export const BENCHMARK_TIERS = ["flagship", "balanced", "efficient"] as const
export type BenchmarkTier = (typeof BENCHMARK_TIERS)[number]

export const BENCHMARK_STATUSES = ["running", "completed", "failed"] as const
export type BenchmarkStatus = (typeof BENCHMARK_STATUSES)[number]

export const modelBenchmarks = pgTable(
  "model_benchmarks",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    /** Which production tier the candidate is measured for. */
    tier: text("tier").notNull().$type<BenchmarkTier>(),
    baseline_model: text("baseline_model").notNull(),
    candidate_model: text("candidate_model").notNull(),
    /** Suite revision — re-benchmarking is allowed when the suite changes. */
    suite_version: text("suite_version").notNull(),
    status: text("status").notNull().default("running").$type<BenchmarkStatus>(),
    /** Full per-dimension scorecard: { dimensions: [{key, baseline, candidate, …}] }. */
    scores: jsonb("scores"),
    /** Aggregate: recommendation, deltas, reasons — shape in benchmark/scoring.ts. */
    summary: jsonb("summary"),
    /** Thresholds in force at decision time (auditability). */
    thresholds: jsonb("thresholds"),
    judge_model: text("judge_model"),
    error: text("error"),
    /** "manual" | "auto-discovery" | "cli" */
    triggered_by: text("triggered_by"),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completed_at: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    // Dedupe guard for auto-discovery + newest-first listing.
    index("model_benchmarks_pair_idx").on(t.candidate_model, t.baseline_model, t.suite_version),
    index("model_benchmarks_created_idx").on(t.created_at),
  ],
)
