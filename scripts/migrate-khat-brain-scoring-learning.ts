/**
 * Phase 5 — Scoring + Learning vocab extension.
 *
 * ADDITIVE + IDEMPOTENT. Relaxes one CHECK constraint:
 *
 *   editorial_taste_weights.dimension
 *     before: IN ('theme','lens','source','tag','topic_domain')
 *     after : ... + 'language'
 *
 * No row data is touched. Wrapped in DO blocks that swallow
 * `undefined_object` (drop missed) + `duplicate_object` (add re-run).
 *
 *   npm run migrate:khat-brain-scoring-learning
 */

import { db } from "@/lib/db"
import { sql } from "drizzle-orm"

async function exec(label: string, text: string): Promise<void> {
  process.stdout.write(`  · ${label} … `)
  await db!.execute(sql.raw(text))
  console.log("ok")
}
async function probe(value: string): Promise<boolean> {
  const r = await db!.execute(sql.raw(`
    SELECT NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'chk_taste_weights_dimension'
        AND pg_get_constraintdef(oid) NOT LIKE '%''${value}''%'
    ) AS allowed
  `))
  return (r.rows[0] as { allowed?: boolean }).allowed === true
}
async function fetchCount(rel: string): Promise<number> {
  const r = await db!.execute(sql.raw(`SELECT count(*)::int AS n FROM ${rel}`))
  return Number((r.rows[0] as { n?: number } | undefined)?.n ?? 0)
}

async function main() {
  console.log("Phase 5 — scoring + learning vocab extension\n")
  console.log("BEFORE")
  console.log(`  editorial_taste_weights rows : ${await fetchCount("editorial_taste_weights")}`)
  console.log(`  dimension allows 'language'  : ${(await probe("language")) ? "yes" : "no"}`)

  console.log("\neditorial_taste_weights.dimension CHECK:")
  await exec(
    "drop old CHECK (if present)",
    `
    DO $$ BEGIN
      ALTER TABLE editorial_taste_weights DROP CONSTRAINT chk_taste_weights_dimension;
    EXCEPTION WHEN undefined_object THEN NULL;
    END $$;
  `,
  )
  await exec(
    "add CHECK including 'language'",
    `
    DO $$ BEGIN
      ALTER TABLE editorial_taste_weights ADD CONSTRAINT chk_taste_weights_dimension
        CHECK (dimension IN ('theme','lens','source','tag','topic_domain','language'));
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `,
  )

  console.log("\nAFTER")
  console.log(`  editorial_taste_weights rows : ${await fetchCount("editorial_taste_weights")}`)
  console.log(`  dimension allows 'language'  : ${(await probe("language")) ? "yes" : "no"}`)

  console.log("\n✅ Phase 5 migration complete.")
  process.exit(0)
}

main().catch((err) => {
  console.error("\n💥 migration failed:", err)
  process.exit(1)
})
