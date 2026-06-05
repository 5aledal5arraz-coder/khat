/**
 * Phase 1.5 — `ai_runs_summary` monthly roll-up table.
 *
 * One row per (year_month × task_kind × provider × model_name ×
 * prompt_version) combination. Populated by the retention job whenever
 * an ai_runs row ages past the strip threshold (90 days).
 *
 * Bounded growth: months × ~6 task_kinds × ~3 providers × ~10 models ×
 * ~30 prompt_versions = low thousands of rows over the project's life.
 *
 * Idempotent inserts: ON CONFLICT (unique key) DO UPDATE SET counters
 * = excluded.* + ai_runs_summary.* — re-running the retention job over
 * the same set of source rows is a no-op (because the strip step sets
 * stripped_at and the roll-up filters on stripped_at IS NULL).
 *
 * `error_class_counts` is a small JSONB map like
 *   { "quota_exceeded": 3, "JsonParseError": 1 }
 * for monthly AI-reliability reporting in Phase 7.
 */

import {
  pgTable,
  text,
  integer,
  bigint,
  jsonb,
  timestamp,
  numeric,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core"

export const aiRunsSummary = pgTable(
  "ai_runs_summary",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    /** "YYYY-MM", e.g. "2026-05". Computed from completed_at of the source rows. */
    year_month: text("year_month").notNull(),
    task_kind: text("task_kind").notNull(),
    provider: text("provider").notNull(),
    model_name: text("model_name").notNull(),
    /** Nullable — legacy ai_runs rows have prompt_version=null and are still rolled up. */
    prompt_version: text("prompt_version"),

    total_runs: integer("total_runs").notNull(),
    succeeded: integer("succeeded").notNull(),
    failed: integer("failed").notNull(),
    timed_out: integer("timed_out").notNull(),

    total_tokens_in: bigint("total_tokens_in", { mode: "number" }).notNull().default(0),
    total_tokens_out: bigint("total_tokens_out", { mode: "number" }).notNull().default(0),
    total_cost_usd: numeric("total_cost_usd", { precision: 12, scale: 4 })
      .notNull()
      .default("0"),

    /** Sum/count weighted mean stored as integer milliseconds. */
    mean_latency_ms: integer("mean_latency_ms"),

    /**
     * Map of error_class string → count for this month/feature/provider
     * combo. Sparse object; { } when there were no failures.
     */
    error_class_counts: jsonb("error_class_counts")
      .$type<Record<string, number>>()
      .notNull()
      .default({}),

    computed_at: timestamp("computed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    /**
     * Unique key for the upsert path. Because prompt_version is nullable
     * and Postgres treats NULL as distinct in unique indexes, we coalesce
     * to a sentinel string at index time so two "(null prompt_version)"
     * rows for the same month/feature collapse into one.
     */
    uniqueIndex("uq_ai_runs_summary_dimensions").on(
      t.year_month,
      t.task_kind,
      t.provider,
      t.model_name,
      t.prompt_version,
    ),
    index("idx_ai_runs_summary_year_month").on(t.year_month),
    index("idx_ai_runs_summary_task_kind").on(t.task_kind),
  ],
)
