/**
 * Khat Brain Phase 3 — link downstream tables to the EIR.
 *
 * Adds nullable `eir_id` to:
 *   - studio_sessions
 *   - episodes
 *   - collaboration_rooms
 *
 * Plus FKs (SET NULL on EIR delete) and indexes. Idempotent.
 *
 * Invocation:
 *   npm run migrate:khat-brain-downstream
 */

import { db } from "@/lib/db"
import { sql } from "drizzle-orm"

async function exec(label: string, text: string): Promise<void> {
  process.stdout.write(`  · ${label} … `)
  await db!.execute(sql.raw(text))
  console.log("ok")
}

async function attach(table: string): Promise<void> {
  console.log(`\n${table}:`)
  await exec(
    "add eir_id column",
    `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS eir_id text`,
  )
  await exec(
    "add FK to episode_intelligence_records",
    `DO $$ BEGIN
       ALTER TABLE ${table}
         ADD CONSTRAINT fk_${table}_eir
         FOREIGN KEY (eir_id)
         REFERENCES episode_intelligence_records(id)
         ON DELETE SET NULL;
     EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  )
  await exec(
    "index on eir_id",
    `CREATE INDEX IF NOT EXISTS idx_${table}_eir
       ON ${table} (eir_id)
       WHERE eir_id IS NOT NULL`,
  )
}

async function main() {
  console.log("Khat Brain Phase 3 — downstream EIR link migration\n")

  // Pre-existing schema drift on collaboration_rooms — the Drizzle
  // schema declares these but the DB never had them. Drizzle INSERTs
  // hit a missing-column error; align before adding eir_id so the
  // table is consistent with what the rest of the code expects.
  console.log("collaboration_rooms (drift fix):")
  await exec(
    "add recording_paused_at",
    `ALTER TABLE collaboration_rooms ADD COLUMN IF NOT EXISTS recording_paused_at timestamptz`,
  )
  await exec(
    "add recording_elapsed_ms",
    `ALTER TABLE collaboration_rooms ADD COLUMN IF NOT EXISTS recording_elapsed_ms integer NOT NULL DEFAULT 0`,
  )

  await attach("studio_sessions")
  await attach("episodes")
  await attach("collaboration_rooms")

  console.log("\n✅ Downstream EIR link migration complete.\n")

  for (const tbl of ["studio_sessions", "episodes", "collaboration_rooms"]) {
    const r = (await db!.execute(
      sql.raw(`SELECT
                 count(*) FILTER (WHERE eir_id IS NOT NULL)::int AS linked,
                 count(*) FILTER (WHERE eir_id IS NULL)::int AS unlinked
               FROM ${tbl}`),
    )) as unknown as { rows: Array<{ linked: number; unlinked: number }> }
    const row = r.rows[0]
    console.log(`  ${tbl}: linked=${row?.linked ?? 0}, unlinked=${row?.unlinked ?? 0}`)
  }

  process.exit(0)
}

main().catch((e) => {
  console.error("❌ migration failed:", e)
  process.exit(1)
})
