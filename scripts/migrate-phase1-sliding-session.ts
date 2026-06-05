/**
 * Phase 1.1 — add `last_seen_at` column to `admin_sessions`.
 *
 *   npm run migrate:phase1-sliding-session
 *
 * Idempotent. The column is nullable with no default; pre-migration
 * rows stay null and the decideSessionSlide() helper treats null as
 * "never extended."
 *
 * Rollback:
 *   MIGRATE_PHASE1_REVERSE=1 npm run migrate:phase1-sliding-session
 * (drops the column + index).
 *
 * Touches:
 *   • admin_sessions.last_seen_at  TIMESTAMP WITH TIME ZONE  NULLABLE
 *   • idx_admin_sessions_last_seen_at (partial — non-null only,
 *     supports operator analytics later: "who's been active last 24h?")
 */

import { sql } from "drizzle-orm"
import { db } from "@/lib/db"

const REVERSE = process.env.MIGRATE_PHASE1_REVERSE === "1"

async function main() {
  if (!db) {
    console.error("[phase1] db is null — DATABASE_URL not configured")
    process.exit(1)
  }

  if (REVERSE) {
    console.log("[phase1] REVERSE: dropping last_seen_at column…")
    await db.execute(sql`DROP INDEX IF EXISTS idx_admin_sessions_last_seen_at`)
    await db.execute(
      sql`ALTER TABLE admin_sessions DROP COLUMN IF EXISTS last_seen_at`,
    )
    console.log("[phase1] reverse complete")
    process.exit(0)
  }

  console.log("[phase1] forward: adding last_seen_at column…")

  await db.execute(sql`
    ALTER TABLE admin_sessions
    ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMP WITH TIME ZONE
  `)

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_admin_sessions_last_seen_at
    ON admin_sessions (last_seen_at)
    WHERE last_seen_at IS NOT NULL
  `)

  const check = (await db.execute(sql`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'admin_sessions' AND column_name = 'last_seen_at'
  `)) as unknown as {
    rows: Array<{ column_name: string; data_type: string; is_nullable: string }>
  }
  console.log("[phase1] post-migrate column state:", JSON.stringify(check.rows, null, 2))
  console.log("[phase1] forward migration complete")
  process.exit(0)
}

main().catch((err) => {
  console.error("[phase1] migration failed:", err)
  process.exit(1)
})
