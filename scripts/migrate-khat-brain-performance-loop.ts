/**
 * Khat Brain Phase 8 — performance learning loop migration.
 *
 *   episode_performance_signals  (per-EIR rolling-window + signal score)
 *
 * Plus generated normalized_name column + index on guests for fast
 * findGuestMatch lookups (Phase 8 D1).
 *
 *   npm run migrate:khat-brain-performance-loop
 */

import { db } from "@/lib/db"
import { sql } from "drizzle-orm"

async function exec(label: string, text: string): Promise<void> {
  process.stdout.write(`  · ${label} … `)
  await db!.execute(sql.raw(text))
  console.log("ok")
}

async function main() {
  console.log("Khat Brain Phase 8 — performance loop + indexes\n")

  console.log("episode_performance_signals:")
  await exec(
    "create table",
    `CREATE TABLE IF NOT EXISTS episode_performance_signals (
       id text PRIMARY KEY,
       eir_id text NOT NULL REFERENCES episode_intelligence_records(id) ON DELETE CASCADE,
       views_at_7d real,
       views_at_14d real,
       views_at_28d real,
       like_rate real,
       comment_rate real,
       engagement_rate real,
       view_velocity_7d real,
       view_velocity_14d real,
       view_velocity_28d real,
       editorial_signal_score real,
       baseline_used text,
       explanation jsonb,
       calculated_at timestamptz NOT NULL DEFAULT now(),
       created_at timestamptz NOT NULL DEFAULT now(),
       updated_at timestamptz NOT NULL DEFAULT now()
     )`,
  )
  await exec(
    "baseline CHECK",
    `DO $$ BEGIN
       ALTER TABLE episode_performance_signals
         ADD CONSTRAINT chk_eps_baseline CHECK (
           baseline_used IS NULL OR baseline_used IN ('season','global','absolute')
         );
     EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  )
  await exec(
    "unique eir_id",
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_episode_performance_signals_eir
       ON episode_performance_signals (eir_id)`,
  )
  await exec(
    "index editorial_signal_score",
    `CREATE INDEX IF NOT EXISTS idx_episode_performance_signals_score
       ON episode_performance_signals (editorial_signal_score DESC NULLS LAST)`,
  )
  await exec(
    "updated_at trigger",
    `DO $$ BEGIN
       CREATE TRIGGER trg_episode_performance_signals_updated_at
         BEFORE UPDATE ON episode_performance_signals
         FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
     EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  )

  console.log("\nguests — generated normalized_name column + index:")
  // Generated column lets us index the normalized form without a trigger.
  // The expression mirrors normalizeName() in lib/guests/canonical.ts:
  //   lowercase + strip Arabic diacritics + collapse to spaces.
  await exec(
    "add normalized_name (generated)",
    `DO $$ BEGIN
       ALTER TABLE guests ADD COLUMN normalized_name text
         GENERATED ALWAYS AS (
           regexp_replace(
             regexp_replace(
               translate(lower(name), E'\\u064B\\u064C\\u064D\\u064E\\u064F\\u0650\\u0651\\u0652\\u0670', ''),
               '[^a-z0-9\\u0600-\\u06ff\\s]+', ' ', 'g'
             ),
             '\\s+', ' ', 'g'
           )
         ) STORED;
     EXCEPTION WHEN duplicate_column THEN NULL; END $$`,
  )
  await exec(
    "index normalized_name",
    `CREATE INDEX IF NOT EXISTS idx_guests_normalized_name
       ON guests (normalized_name)`,
  )

  console.log("\n✅ Performance loop + index migration complete.\n")
  for (const t of ["episode_performance_signals"]) {
    const r = (await db!.execute(sql.raw(`SELECT count(*)::int AS c FROM ${t}`))) as unknown as {
      rows: Array<{ c: number }>
    }
    console.log(`  ${t}: ${r.rows[0]?.c ?? 0} rows`)
  }
  process.exit(0)
}

main().catch((e) => {
  console.error("❌ migration failed:", e)
  process.exit(1)
})
