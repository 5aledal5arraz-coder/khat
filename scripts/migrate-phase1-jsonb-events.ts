/**
 * Phase 1.3 — create `jsonb_validation_events` table for JSONB drift logging.
 *
 *   npm run migrate:phase1-jsonb-events
 *
 * Idempotent. Adds the table + three indexes.
 *
 * Rollback:
 *   MIGRATE_PHASE1_JSONB_REVERSE=1 npm run migrate:phase1-jsonb-events
 *   (drops the table; drift history is lost).
 */

import { sql } from "drizzle-orm"
import { db } from "@/lib/db"

const REVERSE = process.env.MIGRATE_PHASE1_JSONB_REVERSE === "1"

async function main() {
  if (!db) {
    console.error("[phase1-jsonb] db is null — DATABASE_URL not configured")
    process.exit(1)
  }

  if (REVERSE) {
    console.log("[phase1-jsonb] REVERSE: dropping jsonb_validation_events…")
    await db.execute(sql`DROP INDEX IF EXISTS idx_jve_created_at`)
    await db.execute(sql`DROP INDEX IF EXISTS idx_jve_table_column_created`)
    await db.execute(sql`DROP INDEX IF EXISTS idx_jve_raw_value_hash`)
    await db.execute(sql`DROP TABLE IF EXISTS jsonb_validation_events`)
    console.log("[phase1-jsonb] reverse complete")
    process.exit(0)
  }

  console.log("[phase1-jsonb] forward: creating jsonb_validation_events…")

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS jsonb_validation_events (
      id              text PRIMARY KEY,
      created_at      timestamp with time zone NOT NULL DEFAULT now(),
      column_name     text NOT NULL,
      table_name      text NOT NULL,
      row_id          text,
      mode            text NOT NULL CHECK (mode IN ('report','enforce','scanner')),
      source          text NOT NULL CHECK (source IN ('write-wrapper','scanner')),
      issue_count     integer NOT NULL,
      issue_summary   text NOT NULL,
      raw_value_hash  text NOT NULL
    )
  `)

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_jve_created_at
    ON jsonb_validation_events (created_at)
  `)
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_jve_table_column_created
    ON jsonb_validation_events (table_name, column_name, created_at)
  `)
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_jve_raw_value_hash
    ON jsonb_validation_events (raw_value_hash)
  `)

  const check = (await db.execute(sql`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'jsonb_validation_events'
    ORDER BY ordinal_position
  `)) as unknown as {
    rows: Array<{ column_name: string; data_type: string; is_nullable: string }>
  }
  console.log("[phase1-jsonb] post-migrate columns:", JSON.stringify(check.rows, null, 2))
  console.log("[phase1-jsonb] forward migration complete")
  process.exit(0)
}

main().catch((err) => {
  console.error("[phase1-jsonb] migration failed:", err)
  process.exit(1)
})
