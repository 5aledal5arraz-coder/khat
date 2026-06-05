/**
 * Phase 0 — add `prompt_version` column to `ai_runs`.
 *
 *   npx tsx scripts/migrate-phase0-prompt-version.ts
 *
 * Idempotent: re-running is a no-op. The column is nullable with no
 * default; legacy rows remain null and the eval CLI ignores them.
 *
 * Rollback:
 *   ALTER TABLE ai_runs DROP COLUMN prompt_version;
 * (Or set MIGRATE_PHASE0_REVERSE=1 to apply the reverse migration via this
 * same script.)
 *
 * Touches:
 *   • ai_runs.prompt_version  TEXT  NULLABLE
 *   • CREATE INDEX idx_ai_runs_prompt_version (partial; non-null only)
 */

import { sql } from "drizzle-orm"
import { db } from "@/lib/db"

const REVERSE = process.env.MIGRATE_PHASE0_REVERSE === "1"

async function main() {
  if (!db) {
    console.error("[phase0] db is null — DATABASE_URL not configured")
    process.exit(1)
  }

  if (REVERSE) {
    console.log("[phase0] REVERSE migration: dropping prompt_version column…")
    await db.execute(sql`DROP INDEX IF EXISTS idx_ai_runs_prompt_version`)
    await db.execute(sql`ALTER TABLE ai_runs DROP COLUMN IF EXISTS prompt_version`)
    console.log("[phase0] reverse complete")
    process.exit(0)
  }

  console.log("[phase0] forward migration: adding prompt_version column…")

  // 1. Column.
  await db.execute(sql`
    ALTER TABLE ai_runs
    ADD COLUMN IF NOT EXISTS prompt_version TEXT
  `)

  // 2. Partial index — only the non-null rows. Eval queries filter on
  //    `prompt_version IS NOT NULL` so a partial index is the right
  //    shape (smaller index, only the rows we ever look up by).
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_ai_runs_prompt_version
    ON ai_runs (prompt_version)
    WHERE prompt_version IS NOT NULL
  `)

  // 3. Sanity check.
  const check = (await db.execute(sql`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'ai_runs' AND column_name = 'prompt_version'
  `)) as unknown as {
    rows: Array<{ column_name: string; data_type: string; is_nullable: string }>
  }
  console.log("[phase0] post-migrate column state:", JSON.stringify(check.rows, null, 2))

  console.log("[phase0] forward migration complete")
  process.exit(0)
}

main().catch((err) => {
  console.error("[phase0] migration failed:", err)
  process.exit(1)
})
