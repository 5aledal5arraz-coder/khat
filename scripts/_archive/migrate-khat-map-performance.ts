/**
 * Khat Map — performance loop migration.
 *
 * Adds `khat_map_episode_performance` (one snapshot row per converted
 * candidate). Idempotent. Safe to re-run.
 *
 * Invocation:
 *   env $(grep -v '^#' .env.local | grep DATABASE_URL | xargs) \
 *     npx tsx scripts/migrate-khat-map-performance.ts
 */

import { db } from "@/lib/db"
import { sql } from "drizzle-orm"

async function exec(label: string, text: string): Promise<void> {
  process.stdout.write(`  · ${label} … `)
  await db!.execute(sql.raw(text))
  console.log("ok")
}

async function main() {
  console.log("Khat Map performance-loop migration\n")

  await exec(
    "create khat_map_episode_performance",
    `CREATE TABLE IF NOT EXISTS khat_map_episode_performance (
       id text PRIMARY KEY,
       candidate_id text NOT NULL REFERENCES khat_map_episode_candidates(id) ON DELETE CASCADE,
       episode_id text REFERENCES episodes(id) ON DELETE SET NULL,
       preparation_id text REFERENCES episode_preparations(id) ON DELETE SET NULL,

       episode_title text,
       youtube_url text,
       release_date text,
       duration_minutes integer,
       view_count integer,

       quote_count integer NOT NULL DEFAULT 0,
       has_enrichment boolean NOT NULL DEFAULT false,
       has_chapters boolean NOT NULL DEFAULT false,
       has_clips boolean NOT NULL DEFAULT false,

       like_count integer,
       comment_count integer,
       retention_pct real,

       performance_score real,

       topic_domain text,
       episode_type text,
       topic_angle_code text,
       guest_candidate_id text REFERENCES khat_map_guest_candidates(id) ON DELETE SET NULL,

       synced_at timestamptz NOT NULL DEFAULT now()
     )`,
  )

  await exec(
    "unique candidate_id",
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_khat_map_episode_performance_candidate
       ON khat_map_episode_performance (candidate_id)`,
  )

  await exec(
    "domain aggregation index",
    `CREATE INDEX IF NOT EXISTS idx_khat_map_episode_performance_domain
       ON khat_map_episode_performance (topic_domain)`,
  )

  await exec(
    "guest aggregation index",
    `CREATE INDEX IF NOT EXISTS idx_khat_map_episode_performance_guest
       ON khat_map_episode_performance (guest_candidate_id)`,
  )

  console.log("\n✅ Performance-loop migration complete.\n")

  const counts = (await db!.execute(
    sql.raw(`SELECT count(*)::int AS c FROM khat_map_episode_performance`),
  )) as unknown as { rows: Array<{ c: number }> }
  console.log(`khat_map_episode_performance rows: ${counts.rows[0]?.c ?? 0}`)

  process.exit(0)
}

main().catch((e) => {
  console.error("❌", e)
  process.exit(1)
})
