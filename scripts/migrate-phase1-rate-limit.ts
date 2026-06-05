/**
 * Phase 1.6 — rate-limit substrate.
 *
 *   npm run migrate:phase1-rate-limit
 *
 * Adds:
 *   • ai_runs.actor_id           TEXT  NULL
 *   • ai_rate_limit_events       new table
 *   • Four indexes on ai_rate_limit_events
 *
 * Idempotent.
 *
 * Rollback:
 *   MIGRATE_PHASE1_RATE_LIMIT_REVERSE=1 npm run migrate:phase1-rate-limit
 *
 * Reversing drops the table and the column. Past audit rows are lost.
 */

import { sql } from "drizzle-orm"
import { db } from "@/lib/db"

const REVERSE = process.env.MIGRATE_PHASE1_RATE_LIMIT_REVERSE === "1"

async function main() {
  if (!db) {
    console.error("[phase1-rate-limit] db is null — DATABASE_URL not configured")
    process.exit(1)
  }

  if (REVERSE) {
    console.log("[phase1-rate-limit] REVERSE: dropping ai_rate_limit_events + ai_subject_locks + actor_id…")
    await db.execute(sql`DROP INDEX IF EXISTS idx_arle_created_at`)
    await db.execute(sql`DROP INDEX IF EXISTS idx_arle_decision_created`)
    await db.execute(sql`DROP INDEX IF EXISTS idx_arle_actor_created`)
    await db.execute(sql`DROP INDEX IF EXISTS idx_arle_subject`)
    await db.execute(sql`DROP TABLE IF EXISTS ai_rate_limit_events`)
    await db.execute(sql`DROP INDEX IF EXISTS uq_asl_subject`)
    await db.execute(sql`DROP INDEX IF EXISTS idx_asl_acquired_at`)
    await db.execute(sql`DROP TABLE IF EXISTS ai_subject_locks`)
    await db.execute(sql`ALTER TABLE ai_runs DROP COLUMN IF EXISTS actor_id`)
    console.log("[phase1-rate-limit] reverse complete")
    process.exit(0)
  }

  console.log("[phase1-rate-limit] forward: adding actor_id + ai_rate_limit_events…")

  // 1. ai_runs.actor_id
  await db.execute(sql`
    ALTER TABLE ai_runs
    ADD COLUMN IF NOT EXISTS actor_id TEXT
  `)

  // 2. ai_rate_limit_events
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ai_rate_limit_events (
      id                      text PRIMARY KEY,
      created_at              timestamp with time zone NOT NULL DEFAULT now(),
      mode                    text NOT NULL,
      decision                text NOT NULL,
      enforced                text NOT NULL DEFAULT 'false',
      tier                    text NOT NULL,
      task_kind               text NOT NULL,
      actor_id                text,
      subject_table           text,
      subject_id              text,
      current_concurrency     integer,
      concurrency_limit       integer,
      daily_cost_so_far_usd   real,
      daily_cost_limit_usd    real,
      metadata                jsonb
    )
  `)

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_arle_created_at
    ON ai_rate_limit_events (created_at)
  `)
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_arle_decision_created
    ON ai_rate_limit_events (decision, created_at)
  `)
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_arle_actor_created
    ON ai_rate_limit_events (actor_id, created_at)
  `)
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_arle_subject
    ON ai_rate_limit_events (subject_table, subject_id)
  `)

  // 3. ai_subject_locks — row-based subject lock (PATCH).
  //
  //    Replaces the original `pg_try_advisory_lock` approach which
  //    failed under connection-pool reuse: session-scoped advisory
  //    locks are reentrant within the same pg session, so two
  //    sequential acquires from the same JS process could both succeed.
  //    A unique row (PRIMARY KEY (subject_table, subject_id)) gives
  //    real cross-pool exclusion.
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ai_subject_locks (
      id             text PRIMARY KEY,
      subject_table  text NOT NULL,
      subject_id     text NOT NULL,
      acquired_at    timestamp with time zone NOT NULL DEFAULT now(),
      owner_token    text NOT NULL
    )
  `)
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_asl_subject
    ON ai_subject_locks (subject_table, subject_id)
  `)
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_asl_acquired_at
    ON ai_subject_locks (acquired_at)
  `)

  // 4. Sanity check.
  const check = (await db.execute(sql`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name IN ('ai_runs', 'ai_rate_limit_events', 'ai_subject_locks')
      AND column_name IN (
        'actor_id', 'mode', 'decision', 'enforced', 'tier', 'task_kind',
        'current_concurrency', 'daily_cost_so_far_usd', 'metadata',
        'subject_table', 'subject_id', 'acquired_at', 'owner_token'
      )
    ORDER BY table_name, column_name
  `)) as unknown as {
    rows: Array<{ column_name: string; data_type: string; is_nullable: string }>
  }
  console.log("[phase1-rate-limit] post-migrate columns:", JSON.stringify(check.rows, null, 2))
  console.log("[phase1-rate-limit] forward migration complete")
  process.exit(0)
}

main().catch((err) => {
  console.error("[phase1-rate-limit] migration failed:", err)
  process.exit(1)
})
