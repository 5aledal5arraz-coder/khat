/**
 * Phase X Step 5 — Live Recording V2 schema migration.
 *
 *   - collaboration_rooms.director_notes        text, nullable
 *   - collaboration_rooms.current_section_key   text, nullable
 *   - collaboration_rooms.current_section_index integer, nullable
 *   - room_session_markers (CREATE IF NOT EXISTS — table is in the
 *     drizzle schema but missing in some local DBs; this migration
 *     installs it idempotently so live v2 has somewhere to write)
 *   - room_session_markers.marker_type CHECK covering the unified
 *     quick-marker taxonomy (clip, quote, highlight, cut, retake,
 *     tech_issue, break_start, break_end, chapter) plus legacy values.
 *     (The canonical CHECK now also lives in scripts/post-schema.sql so
 *     it is re-applied on every deploy as the taxonomy evolves.)
 *
 *   npm run migrate:khat-brain-live-v2
 */

import { db } from "@/lib/db"
import { sql } from "drizzle-orm"

async function exec(label: string, text: string): Promise<void> {
  process.stdout.write(`  · ${label} … `)
  await db!.execute(sql.raw(text))
  console.log("ok")
}

async function main() {
  console.log("Phase X Step 5 — Live Recording V2 schema\n")

  console.log("collaboration_rooms columns:")
  await exec(
    "add director_notes",
    `ALTER TABLE collaboration_rooms ADD COLUMN IF NOT EXISTS director_notes text`,
  )
  await exec(
    "add current_section_key",
    `ALTER TABLE collaboration_rooms ADD COLUMN IF NOT EXISTS current_section_key text`,
  )
  await exec(
    "add current_section_index",
    `ALTER TABLE collaboration_rooms ADD COLUMN IF NOT EXISTS current_section_index integer`,
  )

  console.log("\nroom_session_markers table (idempotent):")
  await exec(
    "create table",
    `
    CREATE TABLE IF NOT EXISTS room_session_markers (
      id           text PRIMARY KEY DEFAULT gen_random_uuid()::text,
      room_id      text NOT NULL REFERENCES collaboration_rooms(id) ON DELETE CASCADE,
      author_id    text NOT NULL REFERENCES room_participants(id) ON DELETE CASCADE,
      marker_type  text NOT NULL,
      label        text NOT NULL,
      note         text,
      recording_ms integer NOT NULL,
      wall_time    timestamptz NOT NULL DEFAULT now(),
      created_at   timestamptz NOT NULL DEFAULT now(),
      section_key  text
    )
    `,
  )
  await exec(
    "add section_key (idempotent)",
    `ALTER TABLE room_session_markers ADD COLUMN IF NOT EXISTS section_key text`,
  )
  // Drop any prior CHECK constraint we own so we can re-create with the
  // expanded vocabulary.
  await exec(
    "drop legacy marker_type CHECK (if any)",
    `
    DO $$ BEGIN
      ALTER TABLE room_session_markers DROP CONSTRAINT IF EXISTS chk_room_session_markers_type;
    EXCEPTION WHEN undefined_table THEN NULL;
    END $$;
    `,
  )
  await exec(
    "marker_type CHECK (unified taxonomy + legacy)",
    `
    DO $$ BEGIN
      ALTER TABLE room_session_markers ADD CONSTRAINT chk_room_session_markers_type
        CHECK (marker_type IN (
          -- canonical quick-marker taxonomy (lib/recording-v2/marker-types.ts)
          'clip','quote','highlight','cut','retake','tech_issue',
          'break_start','break_end','chapter',
          -- system markers (not in the quick-tag UI)
          'energy_change',
          -- legacy values still in production data
          'deep_moment','emotional','revisit','episode_started','break',
          'important','technical_issue','custom'
        ));
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
    `,
  )
  await exec(
    "idx by room",
    `CREATE INDEX IF NOT EXISTS idx_room_session_markers_room ON room_session_markers (room_id, recording_ms)`,
  )

  console.log("\nDone!")
  process.exit(0)
}

main().catch((err) => {
  console.error("\n💥 migration failed:", err)
  process.exit(1)
})
