/**
 * Khat Brain Phase 4 — Studio consolidation + performance snapshots.
 *
 * Adds:
 *   - studio_analysis_records (consolidated Studio output table)
 *   - performance_snapshots   (time-series companion)
 *
 * Idempotent. Does NOT drop any legacy studio_* table — see Phase 4
 * report for the list of kinds that still write to legacy and will
 * migrate in Phase 5+.
 *
 *   npm run migrate:khat-brain-studio
 */

import { db } from "@/lib/db"
import { sql } from "drizzle-orm"

async function exec(label: string, text: string): Promise<void> {
  process.stdout.write(`  · ${label} … `)
  await db!.execute(sql.raw(text))
  console.log("ok")
}

async function main() {
  console.log("Khat Brain Phase 4 — Studio consolidation migration\n")

  console.log("studio_analysis_records:")
  await exec(
    "create table",
    `CREATE TABLE IF NOT EXISTS studio_analysis_records (
       id text PRIMARY KEY,
       eir_id text REFERENCES episode_intelligence_records(id) ON DELETE SET NULL,
       studio_session_id text,
       kind text NOT NULL,
       status text NOT NULL DEFAULT 'ready',
       data jsonb NOT NULL DEFAULT '{}'::jsonb,
       raw_provider_response jsonb,
       error text,
       edited_fields jsonb,
       generated_at timestamptz,
       published_at timestamptz,
       created_at timestamptz NOT NULL DEFAULT now(),
       updated_at timestamptz NOT NULL DEFAULT now()
     )`,
  )

  await exec(
    "kind CHECK",
    `DO $$ BEGIN
       ALTER TABLE studio_analysis_records ADD CONSTRAINT chk_studio_analysis_kind
         CHECK (kind IN (
           'transcript','ai_outputs','chapters','clips','quotes',
           'website_package','analyzer','deep_analysis','guest_intelligence',
           'push_log','metadata','reserved'
         ));
     EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  )
  await exec(
    "status CHECK",
    `DO $$ BEGIN
       ALTER TABLE studio_analysis_records ADD CONSTRAINT chk_studio_analysis_status
         CHECK (status IN ('pending','generating','ready','error','archived'));
     EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  )

  for (const idx of [
    `CREATE INDEX IF NOT EXISTS idx_studio_analysis_eir
       ON studio_analysis_records (eir_id) WHERE eir_id IS NOT NULL`,
    `CREATE INDEX IF NOT EXISTS idx_studio_analysis_session
       ON studio_analysis_records (studio_session_id) WHERE studio_session_id IS NOT NULL`,
    `CREATE INDEX IF NOT EXISTS idx_studio_analysis_eir_kind
       ON studio_analysis_records (eir_id, kind) WHERE eir_id IS NOT NULL`,
    `CREATE INDEX IF NOT EXISTS idx_studio_analysis_session_kind
       ON studio_analysis_records (studio_session_id, kind)
        WHERE studio_session_id IS NOT NULL`,
    `CREATE INDEX IF NOT EXISTS idx_studio_analysis_status
       ON studio_analysis_records (status)`,
  ]) {
    await exec(`index ${idx.match(/idx_\w+/)?.[0]}`, idx)
  }

  await exec(
    "updated_at trigger",
    `DO $$ BEGIN
       CREATE TRIGGER trg_studio_analysis_updated_at
         BEFORE UPDATE ON studio_analysis_records
         FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
     EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  )

  console.log("\nperformance_snapshots:")
  await exec(
    "create table",
    `CREATE TABLE IF NOT EXISTS performance_snapshots (
       id text PRIMARY KEY,
       eir_id text NOT NULL REFERENCES episode_intelligence_records(id) ON DELETE CASCADE,
       episode_id text,
       snapshot_at timestamptz NOT NULL DEFAULT now(),
       view_count text,
       like_count text,
       comment_count text,
       source text NOT NULL,
       raw jsonb,
       created_at timestamptz NOT NULL DEFAULT now()
     )`,
  )
  await exec(
    "source CHECK",
    `DO $$ BEGIN
       ALTER TABLE performance_snapshots ADD CONSTRAINT chk_perf_snapshot_source
         CHECK (source IN ('youtube_api','manual_sync','seed','backfill'));
     EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  )
  for (const idx of [
    `CREATE INDEX IF NOT EXISTS idx_perf_snap_eir_at
       ON performance_snapshots (eir_id, snapshot_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_perf_snap_episode
       ON performance_snapshots (episode_id) WHERE episode_id IS NOT NULL`,
  ]) {
    await exec(`index ${idx.match(/idx_\w+/)?.[0]}`, idx)
  }

  console.log("\n✅ Studio consolidation migration complete.\n")
  for (const tbl of ["studio_analysis_records", "performance_snapshots"]) {
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
