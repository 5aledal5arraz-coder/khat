/**
 * Phase X Step 3 — hybrid_topic_generations migration.
 *
 *   table: hybrid_topic_generations
 *   npm run migrate:khat-brain-hybrid
 */

import { db } from "@/lib/db"
import { sql } from "drizzle-orm"

async function exec(label: string, text: string): Promise<void> {
  process.stdout.write(`  · ${label} … `)
  await db!.execute(sql.raw(text))
  console.log("ok")
}

async function main() {
  console.log("Phase X Step 3 — Hybrid Topic generation log\n")

  console.log("hybrid_topic_generations:")
  await exec(
    "create table",
    `
    CREATE TABLE IF NOT EXISTS hybrid_topic_generations (
      id                text PRIMARY KEY DEFAULT gen_random_uuid()::text,
      season_id         text REFERENCES khat_map_seasons(id) ON DELETE SET NULL,
      language          text NOT NULL DEFAULT 'ar',
      status            text NOT NULL DEFAULT 'pending',
      input_snapshot    jsonb NOT NULL,
      output_topics     jsonb,
      accepted_count    integer NOT NULL DEFAULT 0,
      rejected_count    integer NOT NULL DEFAULT 0,
      rejection_summary jsonb,
      ai_run_id         text REFERENCES ai_runs(id) ON DELETE SET NULL,
      created_by        text,
      created_at        timestamptz NOT NULL DEFAULT now(),
      completed_at      timestamptz,
      error_message     text
    )
    `,
  )
  await exec(
    "status CHECK",
    `
    DO $$ BEGIN
      ALTER TABLE hybrid_topic_generations ADD CONSTRAINT chk_hybrid_gen_status
        CHECK (status IN ('pending', 'running', 'completed', 'failed'));
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
    `,
  )
  await exec(
    "idx season_id",
    `CREATE INDEX IF NOT EXISTS idx_hybrid_gen_season_id ON hybrid_topic_generations (season_id)`,
  )
  await exec(
    "idx language",
    `CREATE INDEX IF NOT EXISTS idx_hybrid_gen_language ON hybrid_topic_generations (language)`,
  )
  await exec(
    "idx status",
    `CREATE INDEX IF NOT EXISTS idx_hybrid_gen_status ON hybrid_topic_generations (status)`,
  )
  await exec(
    "idx created_at",
    `CREATE INDEX IF NOT EXISTS idx_hybrid_gen_created_at ON hybrid_topic_generations (created_at DESC)`,
  )

  console.log("\nDone!")
  process.exit(0)
}

main().catch((err) => {
  console.error("\n💥 migration failed:", err)
  process.exit(1)
})
