/**
 * Khat Map — editorial controls migration.
 *
 * Adds:
 *   • `khat_map_seasons.editorial_controls`  jsonb NOT NULL DEFAULT { ... }
 *   • `khat_map_topic_bank.quality`          text NOT NULL DEFAULT 'normal'
 *     (CHECK in 'strong' | 'normal' | 'weak' | 'deprecated')
 *   • `khat_map_guest_candidates.quality`    text NOT NULL DEFAULT 'normal'
 *     (CHECK in 'strong' | 'normal' | 'weak' | 'avoid')
 *
 * Idempotent. Safe to re-run.
 *
 * Invocation:
 *   env $(grep -v '^#' .env.local | grep DATABASE_URL | xargs) \
 *     npx tsx scripts/migrate-khat-map-editorial-controls.ts
 */

import { db } from "@/lib/db"
import { sql } from "drizzle-orm"

async function exec(label: string, text: string): Promise<void> {
  process.stdout.write(`  · ${label} … `)
  await db!.execute(sql.raw(text))
  console.log("ok")
}

async function main() {
  console.log("Khat Map editorial-controls migration\n")

  console.log("1. khat_map_seasons.editorial_controls")
  await exec(
    "add column",
    `ALTER TABLE khat_map_seasons
       ADD COLUMN IF NOT EXISTS editorial_controls jsonb NOT NULL
       DEFAULT '{
         "guest_filters": {"gender":"all","geography":"worldwide"},
         "domain_weights": {},
         "identity_override": {"priorities":[],"tone_emphasis":{},"identity_description":null},
         "hard_avoid": {"banned_topics":[],"banned_guests":[],"repeated_topics_to_avoid":[]}
       }'::jsonb`,
  )

  console.log("\n2. khat_map_topic_bank.quality")
  await exec(
    "add column",
    `ALTER TABLE khat_map_topic_bank
       ADD COLUMN IF NOT EXISTS quality text NOT NULL DEFAULT 'normal'`,
  )
  await exec(
    "CHECK constraint",
    `DO $$ BEGIN
       ALTER TABLE khat_map_topic_bank ADD CONSTRAINT chk_khat_map_topic_bank_quality
         CHECK (quality IN ('strong','normal','weak','deprecated'));
     EXCEPTION WHEN duplicate_object THEN NULL;
     END $$`,
  )
  // Migrate any 'draft' rows (now removed from the type union) to 'active'.
  await exec(
    "drop legacy 'draft' status",
    `UPDATE khat_map_topic_bank SET status = 'active' WHERE status = 'draft'`,
  )

  console.log("\n3. khat_map_guest_candidates.quality")
  await exec(
    "add column",
    `ALTER TABLE khat_map_guest_candidates
       ADD COLUMN IF NOT EXISTS quality text NOT NULL DEFAULT 'normal'`,
  )
  await exec(
    "CHECK constraint",
    `DO $$ BEGIN
       ALTER TABLE khat_map_guest_candidates ADD CONSTRAINT chk_khat_map_guest_candidates_quality
         CHECK (quality IN ('strong','normal','weak','avoid'));
     EXCEPTION WHEN duplicate_object THEN NULL;
     END $$`,
  )

  console.log("\n✅ Editorial-controls migration complete.\n")

  // Verify
  const cols = (await db!.execute(sql.raw(`
    SELECT table_name, column_name, data_type, column_default
    FROM information_schema.columns
    WHERE (table_name = 'khat_map_seasons' AND column_name = 'editorial_controls')
       OR (table_name = 'khat_map_topic_bank' AND column_name = 'quality')
       OR (table_name = 'khat_map_guest_candidates' AND column_name = 'quality')
    ORDER BY table_name, column_name
  `))) as unknown as { rows: Array<Record<string, unknown>> }
  console.log("New columns:")
  for (const r of cols.rows) {
    console.log(
      `  ${r.table_name}.${r.column_name} (${r.data_type}) default=${r.column_default ?? "—"}`,
    )
  }

  process.exit(0)
}

main().catch((e) => {
  console.error("❌", e)
  process.exit(1)
})
