/**
 * Phase 1 — Editorial Intelligence schema migration.
 *
 * ADDITIVE + IDEMPOTENT. Safe to run multiple times. No destructive
 * changes; existing 293 market_topic_signals rows are backfilled in
 * place with review_status='new' and operator_created=false.
 *
 *   New tables:
 *     - market_signal_review_events
 *     - market_trusted_sources
 *     - editorial_taste_weights
 *
 *   Modified table:
 *     - market_topic_signals : adds review_status, editorial_tags,
 *       reviewed_by, reviewed_at, operator_notes, operator_created,
 *       trusted_source_id, signal_score, score_components
 *
 *   npm run migrate:khat-brain-editorial-intelligence
 */

import { db } from "@/lib/db"
import { sql } from "drizzle-orm"

async function exec(label: string, text: string): Promise<void> {
  process.stdout.write(`  · ${label} … `)
  await db!.execute(sql.raw(text))
  console.log("ok")
}

async function fetchCount(rel: string): Promise<number> {
  const r = await db!.execute(sql.raw(`SELECT count(*)::int AS n FROM ${rel}`))
  return Number((r.rows[0] as { n?: number } | undefined)?.n ?? 0)
}

async function tableExists(name: string): Promise<boolean> {
  const r = await db!.execute(sql.raw(`
    SELECT to_regclass('public.${name}') AS rel
  `))
  return !!(r.rows[0] as { rel?: string | null } | undefined)?.rel
}

async function columnExists(table: string, column: string): Promise<boolean> {
  const r = await db!.execute(sql.raw(`
    SELECT 1 AS one
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='${table}' AND column_name='${column}'
  `))
  return r.rows.length > 0
}

async function main() {
  console.log("Phase 1 — Editorial Intelligence schema\n")

  // ─── BEFORE snapshot ────────────────────────────────────────────────
  console.log("BEFORE")
  const before = {
    market_topic_signals: (await tableExists("market_topic_signals"))
      ? await fetchCount("market_topic_signals")
      : null,
    market_signal_review_events: (await tableExists(
      "market_signal_review_events",
    ))
      ? await fetchCount("market_signal_review_events")
      : null,
    market_trusted_sources: (await tableExists("market_trusted_sources"))
      ? await fetchCount("market_trusted_sources")
      : null,
    editorial_taste_weights: (await tableExists("editorial_taste_weights"))
      ? await fetchCount("editorial_taste_weights")
      : null,
    review_status_col: await columnExists(
      "market_topic_signals",
      "review_status",
    ),
    trusted_source_id_col: await columnExists(
      "market_topic_signals",
      "trusted_source_id",
    ),
  }
  console.log(`  market_topic_signals          : ${before.market_topic_signals ?? "(table missing)"}`)
  console.log(`  market_signal_review_events   : ${before.market_signal_review_events ?? "(table missing)"}`)
  console.log(`  market_trusted_sources        : ${before.market_trusted_sources ?? "(table missing)"}`)
  console.log(`  editorial_taste_weights       : ${before.editorial_taste_weights ?? "(table missing)"}`)
  console.log(`  review_status column          : ${before.review_status_col ? "present" : "absent"}`)
  console.log(`  trusted_source_id column      : ${before.trusted_source_id_col ? "present" : "absent"}`)
  console.log("")

  // ─── market_trusted_sources (CREATE first — signals FK to it) ────
  console.log("market_trusted_sources:")
  await exec(
    "create table",
    `
    CREATE TABLE IF NOT EXISTS market_trusted_sources (
      id                        text PRIMARY KEY DEFAULT gen_random_uuid()::text,
      source_type               text NOT NULL,
      identifier                text NOT NULL,
      display_name              text NOT NULL,
      language                  text NOT NULL DEFAULT 'ar',
      geography                 text,
      trust_score               real NOT NULL DEFAULT 0.5,
      editorial_alignment_score real NOT NULL DEFAULT 0.5,
      active                    boolean NOT NULL DEFAULT true,
      notes                     text,
      created_by                text,
      created_at                timestamptz NOT NULL DEFAULT now(),
      updated_at                timestamptz NOT NULL DEFAULT now()
    )
  `,
  )
  await exec(
    "source_type CHECK",
    `
    DO $$ BEGIN
      ALTER TABLE market_trusted_sources ADD CONSTRAINT chk_trusted_sources_type
        CHECK (source_type IN ('youtube','podcast','website','rss','creator','journalist','thinker'));
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `,
  )
  await exec(
    "trust_score range CHECK",
    `
    DO $$ BEGIN
      ALTER TABLE market_trusted_sources ADD CONSTRAINT chk_trusted_sources_trust_range
        CHECK (trust_score >= 0 AND trust_score <= 1);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `,
  )
  await exec(
    "alignment range CHECK",
    `
    DO $$ BEGIN
      ALTER TABLE market_trusted_sources ADD CONSTRAINT chk_trusted_sources_alignment_range
        CHECK (editorial_alignment_score >= 0 AND editorial_alignment_score <= 1);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `,
  )
  await exec(
    "uq idx (source_type, identifier)",
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_trusted_sources_type_identifier
       ON market_trusted_sources (source_type, identifier)`,
  )
  await exec(
    "idx active",
    `CREATE INDEX IF NOT EXISTS idx_trusted_sources_active
       ON market_trusted_sources (active)`,
  )
  await exec(
    "idx language",
    `CREATE INDEX IF NOT EXISTS idx_trusted_sources_language
       ON market_trusted_sources (language)`,
  )

  // ─── market_topic_signals — additive columns ─────────────────────
  console.log("\nmarket_topic_signals (additive columns):")
  await exec(
    "add review_status",
    `ALTER TABLE market_topic_signals
       ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'new'`,
  )
  await exec(
    "review_status CHECK",
    `
    DO $$ BEGIN
      ALTER TABLE market_topic_signals ADD CONSTRAINT chk_market_signals_review_status
        CHECK (review_status IN ('new','approved','rejected','archived'));
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `,
  )
  await exec(
    "add editorial_tags",
    `ALTER TABLE market_topic_signals
       ADD COLUMN IF NOT EXISTS editorial_tags jsonb`,
  )
  await exec(
    "add reviewed_by",
    `ALTER TABLE market_topic_signals
       ADD COLUMN IF NOT EXISTS reviewed_by text`,
  )
  await exec(
    "add reviewed_at",
    `ALTER TABLE market_topic_signals
       ADD COLUMN IF NOT EXISTS reviewed_at timestamptz`,
  )
  await exec(
    "add operator_notes",
    `ALTER TABLE market_topic_signals
       ADD COLUMN IF NOT EXISTS operator_notes text`,
  )
  await exec(
    "add operator_created",
    `ALTER TABLE market_topic_signals
       ADD COLUMN IF NOT EXISTS operator_created boolean NOT NULL DEFAULT false`,
  )
  await exec(
    "add trusted_source_id",
    `ALTER TABLE market_topic_signals
       ADD COLUMN IF NOT EXISTS trusted_source_id text`,
  )
  await exec(
    "trusted_source_id FK (SET NULL)",
    `
    DO $$ BEGIN
      ALTER TABLE market_topic_signals
        ADD CONSTRAINT fk_market_signals_trusted_source
        FOREIGN KEY (trusted_source_id) REFERENCES market_trusted_sources(id)
        ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `,
  )
  await exec(
    "add signal_score",
    `ALTER TABLE market_topic_signals
       ADD COLUMN IF NOT EXISTS signal_score real`,
  )
  await exec(
    "add score_components",
    `ALTER TABLE market_topic_signals
       ADD COLUMN IF NOT EXISTS score_components jsonb`,
  )
  await exec(
    "idx review_status",
    `CREATE INDEX IF NOT EXISTS idx_market_signals_review_status
       ON market_topic_signals (review_status)`,
  )
  await exec(
    "idx signal_score",
    `CREATE INDEX IF NOT EXISTS idx_market_signals_signal_score
       ON market_topic_signals (signal_score DESC NULLS LAST)`,
  )
  await exec(
    "idx trusted_source",
    `CREATE INDEX IF NOT EXISTS idx_market_signals_trusted_source
       ON market_topic_signals (trusted_source_id)
       WHERE trusted_source_id IS NOT NULL`,
  )

  // ─── market_signal_review_events ─────────────────────────────────
  console.log("\nmarket_signal_review_events:")
  await exec(
    "create table",
    `
    CREATE TABLE IF NOT EXISTS market_signal_review_events (
      id              text PRIMARY KEY DEFAULT gen_random_uuid()::text,
      signal_id       text NOT NULL REFERENCES market_topic_signals(id) ON DELETE CASCADE,
      actor_id        text,
      action          text NOT NULL,
      previous_status text,
      new_status      text,
      tag             text,
      note            text,
      created_at      timestamptz NOT NULL DEFAULT now()
    )
  `,
  )
  await exec(
    "action CHECK",
    `
    DO $$ BEGIN
      ALTER TABLE market_signal_review_events ADD CONSTRAINT chk_signal_review_action
        CHECK (action IN ('approve','reject','tag','untag','note','archive','restore'));
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `,
  )
  await exec(
    "status snapshot CHECK",
    `
    DO $$ BEGIN
      ALTER TABLE market_signal_review_events ADD CONSTRAINT chk_signal_review_status_values
        CHECK (
          (previous_status IS NULL OR previous_status IN ('new','approved','rejected','archived'))
          AND
          (new_status      IS NULL OR new_status      IN ('new','approved','rejected','archived'))
        );
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `,
  )
  await exec(
    "idx signal_id",
    `CREATE INDEX IF NOT EXISTS idx_signal_review_events_signal
       ON market_signal_review_events (signal_id)`,
  )
  await exec(
    "idx created_at",
    `CREATE INDEX IF NOT EXISTS idx_signal_review_events_created
       ON market_signal_review_events (created_at DESC)`,
  )
  await exec(
    "idx actor",
    `CREATE INDEX IF NOT EXISTS idx_signal_review_events_actor
       ON market_signal_review_events (actor_id)
       WHERE actor_id IS NOT NULL`,
  )

  // ─── editorial_taste_weights ─────────────────────────────────────
  console.log("\neditorial_taste_weights:")
  await exec(
    "create table",
    `
    CREATE TABLE IF NOT EXISTS editorial_taste_weights (
      id                 text PRIMARY KEY DEFAULT gen_random_uuid()::text,
      dimension          text NOT NULL,
      key                text NOT NULL,
      weight             real NOT NULL DEFAULT 0,
      sample_size        integer NOT NULL DEFAULT 0,
      last_reinforced_at timestamptz,
      created_at         timestamptz NOT NULL DEFAULT now()
    )
  `,
  )
  await exec(
    "dimension CHECK",
    `
    DO $$ BEGIN
      ALTER TABLE editorial_taste_weights ADD CONSTRAINT chk_taste_weights_dimension
        CHECK (dimension IN ('theme','lens','source','tag','topic_domain'));
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `,
  )
  await exec(
    "weight range CHECK",
    `
    DO $$ BEGIN
      ALTER TABLE editorial_taste_weights ADD CONSTRAINT chk_taste_weights_weight_range
        CHECK (weight >= -1 AND weight <= 1);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `,
  )
  await exec(
    "uq idx (dimension, key)",
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_taste_weights_dimension_key
       ON editorial_taste_weights (dimension, key)`,
  )
  await exec(
    "idx last_reinforced",
    `CREATE INDEX IF NOT EXISTS idx_taste_weights_last_reinforced
       ON editorial_taste_weights (last_reinforced_at DESC NULLS LAST)`,
  )

  // ─── Backfill ────────────────────────────────────────────────────
  // ADD COLUMN ... DEFAULT 'new' / false already applied values to
  // existing rows. This is a paranoid no-op guard in case a row was
  // somehow inserted between ADD COLUMN and now without the default.
  console.log("\nbackfill:")
  await exec(
    "review_status default on legacy rows",
    `UPDATE market_topic_signals
       SET review_status = 'new'
       WHERE review_status IS NULL`,
  )
  await exec(
    "operator_created default on legacy rows",
    `UPDATE market_topic_signals
       SET operator_created = false
       WHERE operator_created IS NULL`,
  )

  // ─── AFTER snapshot ──────────────────────────────────────────────
  console.log("\nAFTER")
  const after = {
    market_topic_signals: await fetchCount("market_topic_signals"),
    market_signal_review_events: await fetchCount("market_signal_review_events"),
    market_trusted_sources: await fetchCount("market_trusted_sources"),
    editorial_taste_weights: await fetchCount("editorial_taste_weights"),
    review_status_col: await columnExists(
      "market_topic_signals",
      "review_status",
    ),
    trusted_source_id_col: await columnExists(
      "market_topic_signals",
      "trusted_source_id",
    ),
  }
  console.log(`  market_topic_signals          : ${after.market_topic_signals}`)
  console.log(`  market_signal_review_events   : ${after.market_signal_review_events}`)
  console.log(`  market_trusted_sources        : ${after.market_trusted_sources}`)
  console.log(`  editorial_taste_weights       : ${after.editorial_taste_weights}`)
  console.log(`  review_status column          : ${after.review_status_col ? "present" : "absent"}`)
  console.log(`  trusted_source_id column      : ${after.trusted_source_id_col ? "present" : "absent"}`)

  // Sanity: confirm review_status='new' coverage.
  const newCount = await db!.execute(sql.raw(`
    SELECT count(*)::int AS n
    FROM market_topic_signals
    WHERE review_status = 'new'
  `))
  const n = Number(
    (newCount.rows[0] as { n?: number } | undefined)?.n ?? 0,
  )
  console.log(`  market_topic_signals where review_status='new' : ${n}`)

  console.log("\n✅ Phase 1 migration complete.")
  process.exit(0)
}

main().catch((err) => {
  console.error("\n💥 migration failed:", err)
  process.exit(1)
})
