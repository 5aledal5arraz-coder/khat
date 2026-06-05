/**
 * Khat Brain Phase 5 — Hidden Guest Discovery migration.
 *
 *   discovery_runs
 *   guest_discovery_candidates
 *
 *   npm run migrate:khat-brain-discovery
 */

import { db } from "@/lib/db"
import { sql } from "drizzle-orm"

async function exec(label: string, text: string): Promise<void> {
  process.stdout.write(`  · ${label} … `)
  await db!.execute(sql.raw(text))
  console.log("ok")
}

async function main() {
  console.log("Khat Brain Phase 5 — Discovery migration\n")

  console.log("discovery_runs:")
  await exec(
    "create table",
    `CREATE TABLE IF NOT EXISTS discovery_runs (
       id text PRIMARY KEY,
       season_id text REFERENCES khat_map_seasons(id) ON DELETE SET NULL,
       status text NOT NULL DEFAULT 'pending',
       seed_prompt text,
       archetypes jsonb,
       source_config jsonb,
       candidate_count integer NOT NULL DEFAULT 0,
       started_at timestamptz,
       completed_at timestamptz,
       created_by text,
       error_message text,
       created_at timestamptz NOT NULL DEFAULT now(),
       updated_at timestamptz NOT NULL DEFAULT now()
     )`,
  )
  await exec(
    "status CHECK",
    `DO $$ BEGIN
       ALTER TABLE discovery_runs ADD CONSTRAINT chk_discovery_run_status
         CHECK (status IN ('pending','seeding','searching','verifying','ranking','completed','failed','cancelled'));
     EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  )
  await exec(
    "idx_discovery_runs_status",
    `CREATE INDEX IF NOT EXISTS idx_discovery_runs_status ON discovery_runs (status)`,
  )
  await exec(
    "idx_discovery_runs_season",
    `CREATE INDEX IF NOT EXISTS idx_discovery_runs_season
       ON discovery_runs (season_id) WHERE season_id IS NOT NULL`,
  )
  await exec(
    "updated_at trigger",
    `DO $$ BEGIN
       CREATE TRIGGER trg_discovery_runs_updated_at
         BEFORE UPDATE ON discovery_runs
         FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
     EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  )

  console.log("\nguest_discovery_candidates:")
  await exec(
    "create table",
    `CREATE TABLE IF NOT EXISTS guest_discovery_candidates (
       id text PRIMARY KEY,
       discovery_run_id text REFERENCES discovery_runs(id) ON DELETE SET NULL,
       proposed_name text,
       proposed_role text,
       proposed_country text,
       archetype jsonb,
       evidence_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
       evidence_summary jsonb,
       platform_signals jsonb,
       story_signals jsonb,
       editorial_fit_score numeric,
       hiddenness_score numeric,
       novelty_score numeric,
       evidence_strength_score numeric,
       composite_score numeric,
       status text NOT NULL DEFAULT 'proposed',
       promoted_guest_id text,
       rejection_reason text,
       created_at timestamptz NOT NULL DEFAULT now(),
       updated_at timestamptz NOT NULL DEFAULT now()
     )`,
  )
  await exec(
    "status CHECK",
    `DO $$ BEGIN
       ALTER TABLE guest_discovery_candidates ADD CONSTRAINT chk_disc_cand_status
         CHECK (status IN ('proposed','under_review','promoted','rejected','saved_for_later'));
     EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  )
  for (const idx of [
    `CREATE INDEX IF NOT EXISTS idx_disc_cand_run
       ON guest_discovery_candidates (discovery_run_id) WHERE discovery_run_id IS NOT NULL`,
    `CREATE INDEX IF NOT EXISTS idx_disc_cand_status
       ON guest_discovery_candidates (status)`,
    `CREATE INDEX IF NOT EXISTS idx_disc_cand_composite
       ON guest_discovery_candidates (composite_score DESC NULLS LAST)`,
  ]) {
    await exec(`index ${idx.match(/idx_\w+/)?.[0]}`, idx)
  }
  await exec(
    "updated_at trigger",
    `DO $$ BEGIN
       CREATE TRIGGER trg_disc_cand_updated_at
         BEFORE UPDATE ON guest_discovery_candidates
         FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
     EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  )

  console.log("\n✅ Discovery migration complete.\n")
  for (const tbl of ["discovery_runs", "guest_discovery_candidates"]) {
    const r = (await db!.execute(
      sql.raw(`SELECT count(*)::int AS c FROM ${tbl}`),
    )) as unknown as { rows: Array<{ c: number }> }
    console.log(`  ${tbl}: ${r.rows[0]?.c ?? 0} rows`)
  }
  process.exit(0)
}

main().catch((e) => {
  console.error("❌ migration failed:", e)
  process.exit(1)
})
