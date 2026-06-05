/**
 * Khat Brain Phase 2 — link existing tables to the EIR.
 *
 * Adds nullable `eir_id` to:
 *   - khat_map_episode_candidates
 *   - episode_preparations
 *
 * Plus FKs (SET NULL on EIR delete) and indexes. Idempotent. Does NOT
 * make the columns NOT NULL — flows that don't yet route through the
 * EIR (legacy preparation creation paths) must keep working until they
 * are migrated in Phase 3+.
 *
 * Invocation:
 *   env $(grep -v '^#' .env.local | grep DATABASE_URL | xargs) \
 *     npx tsx scripts/migrate-khat-brain-eir-links.ts
 */

import { db } from "@/lib/db"
import { sql } from "drizzle-orm"

async function exec(label: string, text: string): Promise<void> {
  process.stdout.write(`  · ${label} … `)
  await db!.execute(sql.raw(text))
  console.log("ok")
}

async function main() {
  console.log("Khat Brain Phase 2 — EIR link migration\n")

  console.log("khat_map_episode_candidates:")
  await exec(
    "add eir_id column",
    `ALTER TABLE khat_map_episode_candidates
       ADD COLUMN IF NOT EXISTS eir_id text`,
  )
  await exec(
    "add FK to episode_intelligence_records",
    `DO $$ BEGIN
       ALTER TABLE khat_map_episode_candidates
         ADD CONSTRAINT fk_khat_map_episode_candidates_eir
         FOREIGN KEY (eir_id)
         REFERENCES episode_intelligence_records(id)
         ON DELETE SET NULL;
     EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  )
  await exec(
    "index on eir_id",
    `CREATE INDEX IF NOT EXISTS idx_khat_map_episode_candidates_eir
       ON khat_map_episode_candidates (eir_id)
       WHERE eir_id IS NOT NULL`,
  )
  // Each candidate maps to AT MOST one EIR — uniqueness enforced when set.
  await exec(
    "unique partial index (one EIR per candidate)",
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_khat_map_episode_candidates_eir
       ON khat_map_episode_candidates (eir_id)
       WHERE eir_id IS NOT NULL`,
  )

  console.log("\nepisode_preparations:")
  await exec(
    "add eir_id column",
    `ALTER TABLE episode_preparations
       ADD COLUMN IF NOT EXISTS eir_id text`,
  )
  await exec(
    "add FK to episode_intelligence_records",
    `DO $$ BEGIN
       ALTER TABLE episode_preparations
         ADD CONSTRAINT fk_episode_preparations_eir
         FOREIGN KEY (eir_id)
         REFERENCES episode_intelligence_records(id)
         ON DELETE SET NULL;
     EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  )
  await exec(
    "index on eir_id",
    `CREATE INDEX IF NOT EXISTS idx_episode_preparations_eir
       ON episode_preparations (eir_id)
       WHERE eir_id IS NOT NULL`,
  )

  console.log("\n✅ EIR link migration complete.\n")

  for (const tbl of [
    "khat_map_episode_candidates",
    "episode_preparations",
  ]) {
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
