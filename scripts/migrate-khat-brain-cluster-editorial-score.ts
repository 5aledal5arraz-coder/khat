/**
 * Phase 6 — Cluster editorial score column.
 *
 * ADDITIVE + IDEMPOTENT. Adds:
 *
 *   market_topic_clusters.editorial_score real
 *     — Sum of per-signal contribution weights inside the bucket.
 *       Generator sorts clusters by this column so reviewed + scored
 *       signals dominate over raw popularity.
 *
 * No row data is touched; clusters are projected (wipe + rewrite) on
 * every clustering run, so the new column is populated naturally on
 * the next `market.cluster_signals` job.
 *
 *   npm run migrate:khat-brain-cluster-editorial-score
 */

import { db } from "@/lib/db"
import { sql } from "drizzle-orm"

async function exec(label: string, text: string): Promise<void> {
  process.stdout.write(`  · ${label} … `)
  await db!.execute(sql.raw(text))
  console.log("ok")
}
async function colExists(table: string, column: string): Promise<boolean> {
  const r = await db!.execute(sql.raw(`
    SELECT 1 AS one
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='${table}' AND column_name='${column}'
  `))
  return r.rows.length > 0
}
async function fetchCount(rel: string): Promise<number> {
  const r = await db!.execute(sql.raw(`SELECT count(*)::int AS n FROM ${rel}`))
  return Number((r.rows[0] as { n?: number } | undefined)?.n ?? 0)
}

async function main() {
  console.log("Phase 6 — market_topic_clusters editorial_score\n")
  console.log("BEFORE")
  console.log(`  market_topic_clusters rows : ${await fetchCount("market_topic_clusters")}`)
  console.log(`  editorial_score column     : ${(await colExists("market_topic_clusters", "editorial_score")) ? "present" : "absent"}`)

  console.log("\nmarket_topic_clusters (additive):")
  await exec(
    "add editorial_score",
    `ALTER TABLE market_topic_clusters
       ADD COLUMN IF NOT EXISTS editorial_score real`,
  )
  await exec(
    "idx editorial_score",
    `CREATE INDEX IF NOT EXISTS idx_market_clusters_editorial_score
       ON market_topic_clusters (editorial_score DESC NULLS LAST)`,
  )

  console.log("\nAFTER")
  console.log(`  market_topic_clusters rows : ${await fetchCount("market_topic_clusters")}`)
  console.log(`  editorial_score column     : ${(await colExists("market_topic_clusters", "editorial_score")) ? "present" : "absent"}`)
  console.log("\n✅ Phase 6 migration complete.")
  process.exit(0)
}

main().catch((err) => {
  console.error("\n💥 migration failed:", err)
  process.exit(1)
})
