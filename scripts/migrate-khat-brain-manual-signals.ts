/**
 * Phase 4 — Manual Signals: relax two closed-vocab CHECKs.
 *
 * ADDITIVE in capability (more values allowed), IDEMPOTENT. Wrapped in
 * DO blocks that swallow `undefined_object` (constraint already
 * dropped) and `duplicate_object` (constraint already added). No row
 * data is touched.
 *
 *   market_topic_signals.source
 *     before: IN ('youtube','podcast_apple')
 *     after : IN ('youtube','podcast_apple','manual')
 *
 *   market_signal_review_events.action
 *     before: IN ('approve','reject','tag','untag','note','archive','restore')
 *     after : ... + 'create'
 *
 *   npm run migrate:khat-brain-manual-signals
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
async function probeAllowedSourceValue(value: string): Promise<boolean> {
  const r = await db!.execute(sql.raw(`
    SELECT NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'chk_market_signals_source'
        AND pg_get_constraintdef(oid) NOT LIKE '%''${value}''%'
    ) AS allowed
  `))
  return (r.rows[0] as { allowed?: boolean }).allowed === true
}
async function probeAllowedActionValue(value: string): Promise<boolean> {
  const r = await db!.execute(sql.raw(`
    SELECT NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'chk_signal_review_action'
        AND pg_get_constraintdef(oid) NOT LIKE '%''${value}''%'
    ) AS allowed
  `))
  return (r.rows[0] as { allowed?: boolean }).allowed === true
}

async function main() {
  console.log("Phase 4 — manual signals (CHECK relaxations)\n")

  console.log("BEFORE")
  console.log(`  market_topic_signals rows          : ${await fetchCount("market_topic_signals")}`)
  console.log(`  market_signal_review_events rows   : ${await fetchCount("market_signal_review_events")}`)
  console.log(`  source allows 'manual'             : ${(await probeAllowedSourceValue("manual")) ? "yes" : "no"}`)
  console.log(`  action allows 'create'             : ${(await probeAllowedActionValue("create")) ? "yes" : "no"}`)

  console.log("\nmarket_topic_signals.source CHECK:")
  await exec(
    "drop old CHECK (if present)",
    `
    DO $$ BEGIN
      ALTER TABLE market_topic_signals DROP CONSTRAINT chk_market_signals_source;
    EXCEPTION WHEN undefined_object THEN NULL;
    END $$;
  `,
  )
  await exec(
    "add CHECK including 'manual'",
    `
    DO $$ BEGIN
      ALTER TABLE market_topic_signals ADD CONSTRAINT chk_market_signals_source
        CHECK (source IN ('youtube', 'podcast_apple', 'manual'));
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `,
  )

  console.log("\nmarket_signal_review_events.action CHECK:")
  await exec(
    "drop old CHECK (if present)",
    `
    DO $$ BEGIN
      ALTER TABLE market_signal_review_events DROP CONSTRAINT chk_signal_review_action;
    EXCEPTION WHEN undefined_object THEN NULL;
    END $$;
  `,
  )
  await exec(
    "add CHECK including 'create'",
    `
    DO $$ BEGIN
      ALTER TABLE market_signal_review_events ADD CONSTRAINT chk_signal_review_action
        CHECK (action IN ('approve','reject','tag','untag','note','archive','restore','create'));
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `,
  )

  console.log("\nAFTER")
  console.log(`  market_topic_signals rows          : ${await fetchCount("market_topic_signals")}`)
  console.log(`  market_signal_review_events rows   : ${await fetchCount("market_signal_review_events")}`)
  console.log(`  source allows 'manual'             : ${(await probeAllowedSourceValue("manual")) ? "yes" : "no"}`)
  console.log(`  action allows 'create'             : ${(await probeAllowedActionValue("create")) ? "yes" : "no"}`)

  console.log("\n✅ Phase 4 migration complete.")
  process.exit(0)
}

main().catch((err) => {
  console.error("\n💥 migration failed:", err)
  process.exit(1)
})
