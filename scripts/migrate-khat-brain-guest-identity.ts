/**
 * Khat Brain Phase 6 — guest identity unification migration.
 *
 *   guest_identity_profiles
 *   guest_discovery_links
 *
 *   npm run migrate:khat-brain-guest-identity
 */

import { db } from "@/lib/db"
import { sql } from "drizzle-orm"

async function exec(label: string, text: string): Promise<void> {
  process.stdout.write(`  · ${label} … `)
  await db!.execute(sql.raw(text))
  console.log("ok")
}

async function main() {
  console.log("Khat Brain Phase 6 — guest identity migration\n")

  console.log("guest_identity_profiles:")
  await exec(
    "create table",
    `CREATE TABLE IF NOT EXISTS guest_identity_profiles (
       id text PRIMARY KEY,
       guest_id text NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
       source_summary jsonb,
       discovery_evidence jsonb,
       application_summary jsonb,
       studio_signals jsonb,
       preparation_signals jsonb,
       social_accounts jsonb,
       speaking_style jsonb,
       story_arcs jsonb,
       risk_map jsonb,
       suggested_angles jsonb,
       extraction_questions jsonb,
       fit_scores jsonb,
       last_analyzed_at timestamptz,
       created_at timestamptz NOT NULL DEFAULT now(),
       updated_at timestamptz NOT NULL DEFAULT now()
     )`,
  )
  await exec(
    "unique guest_id",
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_guest_identity_profile_guest
       ON guest_identity_profiles (guest_id)`,
  )
  await exec(
    "updated_at trigger",
    `DO $$ BEGIN
       CREATE TRIGGER trg_guest_identity_profiles_updated_at
         BEFORE UPDATE ON guest_identity_profiles
         FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
     EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  )

  console.log("\nguest_discovery_links:")
  await exec(
    "create table",
    `CREATE TABLE IF NOT EXISTS guest_discovery_links (
       id text PRIMARY KEY,
       guest_id text NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
       discovery_candidate_id text REFERENCES guest_discovery_candidates(id) ON DELETE SET NULL,
       discovery_run_id text,
       link_type text NOT NULL DEFAULT 'promoted',
       confidence_score real,
       created_at timestamptz NOT NULL DEFAULT now()
     )`,
  )
  await exec(
    "idx_gdl_guest",
    `CREATE INDEX IF NOT EXISTS idx_gdl_guest ON guest_discovery_links (guest_id)`,
  )
  await exec(
    "idx_gdl_candidate",
    `CREATE INDEX IF NOT EXISTS idx_gdl_candidate
       ON guest_discovery_links (discovery_candidate_id)
       WHERE discovery_candidate_id IS NOT NULL`,
  )

  console.log("\n✅ Guest identity migration complete.\n")
  for (const t of ["guest_identity_profiles", "guest_discovery_links"]) {
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
