/**
 * Phase Alpha — Guest Discovery Excellence: schema substrate.
 *
 *   npm run migrate:phase-alpha-discovery-v2
 *
 * Additive only. No data is rewritten; no columns are dropped. Existing
 * candidate rows continue to read/write unchanged; only Alpha rows
 * populate the new columns.
 *
 * Forward (idempotent):
 *   1. Pre-flight count.
 *   2. ADD COLUMN IF NOT EXISTS for each Alpha field on
 *      guest_discovery_candidates:
 *        pipeline_version            text
 *        display_name                text
 *        full_name_normalized        text
 *        person_class_signals        jsonb
 *        identity_confidence         numeric
 *        attribute_confidences       jsonb
 *        evidence_bundle             jsonb
 *        hidden_gem_score            numeric
 *        recommendation_score        numeric
 *        dropped_reason              text
 *   3. CREATE INDEX IF NOT EXISTS idx_disc_cand_pipeline
 *      ON guest_discovery_candidates (pipeline_version).
 *   4. CREATE INDEX IF NOT EXISTS idx_disc_cand_recommendation
 *      ON guest_discovery_candidates (recommendation_score DESC).
 *   5. Post-migrate sanity check.
 *
 * Reverse:
 *   MIGRATE_PHASE_ALPHA_DISCOVERY_REVERSE=1 npm run migrate:phase-alpha-discovery-v2
 *
 * Reverse drops the two new indexes and all 10 new columns. Reverse
 * does NOT touch the underlying candidate rows beyond column removal.
 *
 * Decision rule (per Executive Director brief): this migration is
 * additive on purpose — we expand the row, we don't reshape it, so
 * legacy reads keep working and we can compare current vs Alpha
 * side-by-side on the same table.
 */

import { sql } from "drizzle-orm"
import { db, closeDb } from "@/lib/db"

const REVERSE = process.env.MIGRATE_PHASE_ALPHA_DISCOVERY_REVERSE === "1"

const ADDED_COLUMNS = [
  "pipeline_version",
  "display_name",
  "full_name_normalized",
  "person_class_signals",
  "identity_confidence",
  "attribute_confidences",
  "evidence_bundle",
  "hidden_gem_score",
  "recommendation_score",
  "dropped_reason",
] as const

const ADDED_INDEXES = [
  "idx_disc_cand_pipeline",
  "idx_disc_cand_recommendation",
] as const

async function main() {
  if (!db) {
    console.error(
      "[phase-alpha-discovery-v2] db is null — DATABASE_URL not configured",
    )
    process.exit(1)
  }

  if (REVERSE) {
    console.log(
      "[phase-alpha-discovery-v2] REVERSE: dropping indexes + columns…",
    )
    for (const idx of ADDED_INDEXES) {
      await db.execute(sql.raw(`DROP INDEX IF EXISTS ${idx}`))
    }
    for (const col of ADDED_COLUMNS) {
      await db.execute(
        sql.raw(
          `ALTER TABLE guest_discovery_candidates DROP COLUMN IF EXISTS ${col}`,
        ),
      )
    }
    console.log("[phase-alpha-discovery-v2] reverse complete")
    await closeDb()
    process.exit(0)
  }

  console.log("[phase-alpha-discovery-v2] pre-flight:")
  const before = (await db.execute(sql`
    SELECT count(*)::int AS n FROM guest_discovery_candidates
  `)) as unknown as { rows: Array<{ n: number }> }
  console.log(`  existing candidate rows: ${before.rows[0]?.n ?? 0}`)

  // ─── Add columns ─────────────────────────────────────────────────
  const columnTypes: Record<string, string> = {
    pipeline_version: "text",
    display_name: "text",
    full_name_normalized: "text",
    person_class_signals: "jsonb",
    identity_confidence: "numeric",
    attribute_confidences: "jsonb",
    evidence_bundle: "jsonb",
    hidden_gem_score: "numeric",
    recommendation_score: "numeric",
    dropped_reason: "text",
  }
  for (const col of ADDED_COLUMNS) {
    const type = columnTypes[col]
    await db.execute(
      sql.raw(
        `ALTER TABLE guest_discovery_candidates ADD COLUMN IF NOT EXISTS ${col} ${type}`,
      ),
    )
    console.log(`  + column ${col} ${type}`)
  }

  // ─── Indexes ─────────────────────────────────────────────────────
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_disc_cand_pipeline
      ON guest_discovery_candidates (pipeline_version)
  `)
  console.log(`  + index idx_disc_cand_pipeline`)

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_disc_cand_recommendation
      ON guest_discovery_candidates (recommendation_score DESC)
  `)
  console.log(`  + index idx_disc_cand_recommendation`)

  // ─── Sanity check ────────────────────────────────────────────────
  const cols = (await db.execute(sql`
    SELECT column_name
      FROM information_schema.columns
     WHERE table_name = 'guest_discovery_candidates'
       AND column_name = ANY(${sql`ARRAY['pipeline_version','display_name','full_name_normalized','person_class_signals','identity_confidence','attribute_confidences','evidence_bundle','hidden_gem_score','recommendation_score','dropped_reason']`})
  `)) as unknown as { rows: Array<{ column_name: string }> }
  const present = new Set(cols.rows.map((r) => r.column_name))
  const missing = ADDED_COLUMNS.filter((c) => !present.has(c))
  if (missing.length > 0) {
    console.error(`[phase-alpha-discovery-v2] MISSING after migrate: ${missing.join(", ")}`)
    process.exit(2)
  }
  console.log(`[phase-alpha-discovery-v2] all ${ADDED_COLUMNS.length} columns present.`)
  console.log("[phase-alpha-discovery-v2] forward complete.")
  await closeDb()
}

main().catch(async (err) => {
  console.error("[phase-alpha-discovery-v2] fatal:", err)
  try {
    await closeDb()
  } catch {}
  process.exit(1)
})
