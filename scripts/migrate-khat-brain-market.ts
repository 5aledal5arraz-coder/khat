/**
 * Phase X Step 1 — Market Intelligence schema migration.
 *
 *   tables:
 *     - market_topic_signals
 *     - market_topic_clusters
 *
 *   npm run migrate:khat-brain-market
 */

import { db } from "@/lib/db"
import { sql } from "drizzle-orm"

async function exec(label: string, text: string): Promise<void> {
  process.stdout.write(`  · ${label} … `)
  await db!.execute(sql.raw(text))
  console.log("ok")
}

async function main() {
  console.log("Phase X Step 1 — Market Intelligence schema\n")

  console.log("market_topic_signals:")
  await exec(
    "create table",
    `
    CREATE TABLE IF NOT EXISTS market_topic_signals (
      id                text PRIMARY KEY DEFAULT gen_random_uuid()::text,
      source            text NOT NULL,
      external_id       text NOT NULL,
      title             text NOT NULL,
      description       text,
      language          text NOT NULL DEFAULT 'ar',
      view_signal       bigint,
      collected_at      timestamptz NOT NULL DEFAULT now(),
      theme             text,
      emotional_trigger text,
      controversy_score real,
      embedding         jsonb,
      raw               jsonb NOT NULL
    )
  `,
  )
  await exec(
    "source CHECK",
    `
    DO $$ BEGIN
      ALTER TABLE market_topic_signals ADD CONSTRAINT chk_market_signals_source
        CHECK (source IN ('youtube', 'podcast_apple'));
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `,
  )
  await exec(
    "uq idx (source, external_id)",
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_market_signals_source_external
       ON market_topic_signals (source, external_id)`,
  )
  await exec(
    "idx collected_at",
    `CREATE INDEX IF NOT EXISTS idx_market_signals_collected_at
       ON market_topic_signals (collected_at DESC)`,
  )
  await exec(
    "idx theme (partial)",
    `CREATE INDEX IF NOT EXISTS idx_market_signals_theme
       ON market_topic_signals (theme) WHERE theme IS NOT NULL`,
  )
  await exec(
    "idx language",
    `CREATE INDEX IF NOT EXISTS idx_market_signals_language
       ON market_topic_signals (language)`,
  )

  console.log("\nmarket_topic_clusters:")
  await exec(
    "create table",
    `
    CREATE TABLE IF NOT EXISTS market_topic_clusters (
      id                  text PRIMARY KEY DEFAULT gen_random_uuid()::text,
      label               text NOT NULL,
      language            text NOT NULL,
      signal_count        integer NOT NULL,
      dominant_themes     jsonb NOT NULL,
      dominant_emotions   jsonb NOT NULL,
      median_view_signal  bigint,
      source_breakdown    jsonb NOT NULL,
      narrative_hooks     jsonb,
      computed_at         timestamptz NOT NULL DEFAULT now()
    )
  `,
  )
  await exec(
    "idx computed_at",
    `CREATE INDEX IF NOT EXISTS idx_market_clusters_computed_at
       ON market_topic_clusters (computed_at DESC)`,
  )
  await exec(
    "idx language",
    `CREATE INDEX IF NOT EXISTS idx_market_clusters_language
       ON market_topic_clusters (language)`,
  )

  console.log("\nDone!")
  process.exit(0)
}

main().catch((err) => {
  console.error("\n💥 migration failed:", err)
  process.exit(1)
})
