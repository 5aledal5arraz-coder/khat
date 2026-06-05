/**
 * Phase Beta — Editorial voice signals: schema substrate.
 *
 *   npm run migrate:phase-beta-voice-signals
 *
 * Additive only. One new table + 3 indexes.
 *
 * Forward (idempotent):
 *   1. CREATE TABLE IF NOT EXISTS editorial_voice_signals (...)
 *   2. CREATE INDEX IF NOT EXISTS idx_evs_season
 *   3. CREATE INDEX IF NOT EXISTS idx_evs_signal_type
 *   4. CREATE INDEX IF NOT EXISTS idx_evs_created
 *
 * Reverse:
 *   MIGRATE_PHASE_BETA_VOICE_REVERSE=1 npm run migrate:phase-beta-voice-signals
 *
 * Reverse drops the table (indexes drop with it). The fingerprint
 * data is best-effort telemetry; reverse loses it but doesn't break
 * the candidate flow.
 */

import { sql } from "drizzle-orm"
import { db, closeDb } from "@/lib/db"

const REVERSE = process.env.MIGRATE_PHASE_BETA_VOICE_REVERSE === "1"

async function main() {
  if (!db) {
    console.error(
      "[phase-beta-voice-signals] db is null — DATABASE_URL not configured",
    )
    process.exit(1)
  }

  if (REVERSE) {
    console.log("[phase-beta-voice-signals] REVERSE: dropping table…")
    await db.execute(sql`DROP TABLE IF EXISTS editorial_voice_signals`)
    console.log("[phase-beta-voice-signals] reverse complete")
    await closeDb()
    process.exit(0)
  }

  console.log("[phase-beta-voice-signals] forward — creating table + indexes…")

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS editorial_voice_signals (
      id text PRIMARY KEY,
      season_id text NOT NULL REFERENCES khat_map_seasons (id) ON DELETE CASCADE,
      candidate_id text REFERENCES guest_discovery_candidates (id) ON DELETE SET NULL,
      signal_type text NOT NULL,
      snapshot jsonb,
      weight numeric NOT NULL DEFAULT 1.0,
      note text,
      actor_id text,
      created_at timestamp with time zone NOT NULL DEFAULT now()
    )
  `)
  console.log("  + table editorial_voice_signals")

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_evs_season
      ON editorial_voice_signals (season_id)
  `)
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_evs_signal_type
      ON editorial_voice_signals (signal_type)
  `)
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_evs_created
      ON editorial_voice_signals (created_at)
  `)
  console.log("  + indexes idx_evs_season, idx_evs_signal_type, idx_evs_created")

  const sanity = (await db.execute(sql`
    SELECT count(*)::int AS n
      FROM information_schema.tables
     WHERE table_name = 'editorial_voice_signals'
  `)) as unknown as { rows: Array<{ n: number }> }
  if ((sanity.rows[0]?.n ?? 0) === 0) {
    console.error("[phase-beta-voice-signals] table missing after create")
    process.exit(2)
  }
  console.log("[phase-beta-voice-signals] forward complete.")
  await closeDb()
}

main().catch(async (err) => {
  console.error("[phase-beta-voice-signals] fatal:", err)
  try {
    await closeDb()
  } catch {}
  process.exit(1)
})
