/**
 * Phase 1.5 — retention substrate.
 *
 *   npm run migrate:phase1-retention
 *
 * Adds:
 *   • ai_runs.stripped_at        TIMESTAMP WITH TIME ZONE  NULL
 *   • ai_runs_summary table      (monthly roll-up)
 *   • Three indexes on ai_runs_summary
 *
 * Idempotent.
 *
 * Rollback:
 *   MIGRATE_PHASE1_RETENTION_REVERSE=1 npm run migrate:phase1-retention
 *
 * Reversing drops the table and the column. Past-stripped rows stay
 * stripped — the JSONB columns themselves are gone. Restore-from-backup
 * is the only way to recover stripped JSONB blobs.
 */

import { sql } from "drizzle-orm"
import { db } from "@/lib/db"

const REVERSE = process.env.MIGRATE_PHASE1_RETENTION_REVERSE === "1"

async function main() {
  if (!db) {
    console.error("[phase1-retention] db is null — DATABASE_URL not configured")
    process.exit(1)
  }

  if (REVERSE) {
    console.log("[phase1-retention] REVERSE: dropping ai_runs_summary + stripped_at…")
    await db.execute(sql`DROP INDEX IF EXISTS idx_ai_runs_summary_year_month`)
    await db.execute(sql`DROP INDEX IF EXISTS idx_ai_runs_summary_task_kind`)
    await db.execute(sql`DROP INDEX IF EXISTS uq_ai_runs_summary_dimensions`)
    await db.execute(sql`DROP TABLE IF EXISTS ai_runs_summary`)
    await db.execute(sql`ALTER TABLE ai_runs DROP COLUMN IF EXISTS stripped_at`)
    console.log("[phase1-retention] reverse complete")
    process.exit(0)
  }

  console.log("[phase1-retention] forward: adding stripped_at + ai_runs_summary…")

  // 1. ai_runs.stripped_at
  await db.execute(sql`
    ALTER TABLE ai_runs
    ADD COLUMN IF NOT EXISTS stripped_at TIMESTAMP WITH TIME ZONE
  `)

  // 2. ai_runs_summary
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ai_runs_summary (
      id              text PRIMARY KEY,
      year_month      text NOT NULL,
      task_kind       text NOT NULL,
      provider        text NOT NULL,
      model_name      text NOT NULL,
      prompt_version  text,
      total_runs      integer NOT NULL,
      succeeded       integer NOT NULL,
      failed          integer NOT NULL,
      timed_out       integer NOT NULL,
      total_tokens_in   bigint NOT NULL DEFAULT 0,
      total_tokens_out  bigint NOT NULL DEFAULT 0,
      total_cost_usd    numeric(12,4) NOT NULL DEFAULT 0,
      mean_latency_ms integer,
      error_class_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
      computed_at     timestamp with time zone NOT NULL DEFAULT now()
    )
  `)

  // Unique key — coalesce nullable prompt_version so two "(null)" rows for
  // the same month/feature/provider/model collapse to one.
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_ai_runs_summary_dimensions
    ON ai_runs_summary (
      year_month,
      task_kind,
      provider,
      model_name,
      COALESCE(prompt_version, '')
    )
  `)
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_ai_runs_summary_year_month
    ON ai_runs_summary (year_month)
  `)
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_ai_runs_summary_task_kind
    ON ai_runs_summary (task_kind)
  `)

  // 3. Sanity check.
  const check = (await db.execute(sql`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name IN ('ai_runs', 'ai_runs_summary')
      AND column_name IN ('stripped_at', 'year_month', 'task_kind', 'total_runs',
                          'total_cost_usd', 'error_class_counts')
    ORDER BY table_name, column_name
  `)) as unknown as {
    rows: Array<{ column_name: string; data_type: string; is_nullable: string }>
  }
  console.log("[phase1-retention] post-migrate columns:", JSON.stringify(check.rows, null, 2))
  console.log("[phase1-retention] forward migration complete")
  process.exit(0)
}

main().catch((err) => {
  console.error("[phase1-retention] migration failed:", err)
  process.exit(1)
})
