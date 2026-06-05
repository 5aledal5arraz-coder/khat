/**
 * Phase 3 — mini-migration: add archived_at to market_trusted_sources.
 *
 * ADDITIVE + IDEMPOTENT. Distinct from `active` — deactivation pauses
 * a source, archival removes it from the default operator view.
 *
 *   npm run migrate:khat-brain-trusted-sources-archive
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
async function columnExists(table: string, column: string): Promise<boolean> {
  const r = await db!.execute(sql.raw(`
    SELECT 1 AS one
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='${table}' AND column_name='${column}'
  `))
  return r.rows.length > 0
}

async function main() {
  console.log("Phase 3 — trusted_sources archive column\n")

  console.log("BEFORE")
  console.log(`  market_trusted_sources count   : ${await fetchCount("market_trusted_sources")}`)
  console.log(`  archived_at column             : ${(await columnExists("market_trusted_sources", "archived_at")) ? "present" : "absent"}`)

  console.log("\nmarket_trusted_sources (additive):")
  await exec(
    "add archived_at",
    `ALTER TABLE market_trusted_sources
       ADD COLUMN IF NOT EXISTS archived_at timestamptz`,
  )
  await exec(
    "idx archived_at",
    `CREATE INDEX IF NOT EXISTS idx_trusted_sources_archived
       ON market_trusted_sources (archived_at)`,
  )

  console.log("\nAFTER")
  console.log(`  market_trusted_sources count   : ${await fetchCount("market_trusted_sources")}`)
  console.log(`  archived_at column             : ${(await columnExists("market_trusted_sources", "archived_at")) ? "present" : "absent"}`)

  console.log("\n✅ Phase 3 mini-migration complete.")
  process.exit(0)
}

main().catch((err) => {
  console.error("\n💥 migration failed:", err)
  process.exit(1)
})
