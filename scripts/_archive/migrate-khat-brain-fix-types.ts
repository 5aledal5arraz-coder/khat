/**
 * Khat Brain — type alignment fix.
 *
 * The Phase 1 foundation migration created `created_by` and `actor_id`
 * as `uuid`, but the Drizzle schema declares them as `text` to match
 * the rest of the codebase (e.g. `episode_preparations.created_by` is
 * text). This migration aligns the DB to the schema.
 *
 * Idempotent: detects the current column type and only acts when needed.
 *
 * Invocation:
 *   env $(grep -v '^#' .env.local | grep DATABASE_URL | xargs) \
 *     npx tsx scripts/migrate-khat-brain-fix-types.ts
 */

import { db } from "@/lib/db"
import { sql } from "drizzle-orm"

async function getColumnType(table: string, column: string): Promise<string | null> {
  const r = (await db!.execute(
    sql.raw(`
      SELECT data_type FROM information_schema.columns
       WHERE table_schema='public' AND table_name='${table}' AND column_name='${column}'
    `),
  )) as unknown as { rows: Array<{ data_type: string }> }
  return r.rows[0]?.data_type ?? null
}

async function dropForeignKeysOn(table: string, column: string): Promise<void> {
  // Find every FK constraint on this column.
  const r = (await db!.execute(
    sql.raw(`
      SELECT con.conname
        FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ANY(con.conkey)
       WHERE rel.relname = '${table}'
         AND att.attname = '${column}'
         AND con.contype = 'f'
    `),
  )) as unknown as { rows: Array<{ conname: string }> }
  for (const row of r.rows) {
    await db!.execute(
      sql.raw(`ALTER TABLE ${table} DROP CONSTRAINT IF EXISTS ${row.conname}`),
    )
  }
}

async function alterToText(table: string, column: string): Promise<void> {
  const t = await getColumnType(table, column)
  if (t === null) {
    console.log(`  · ${table}.${column} … missing (skip)`)
    return
  }
  if (t === "text") {
    console.log(`  · ${table}.${column} … already text (skip)`)
    return
  }
  process.stdout.write(`  · ${table}.${column} (${t} → text) … `)
  // Drop FK constraints first since they bind the column to admin_users.id (uuid).
  // The Drizzle schema declares no FK on created_by/actor_id (matching the rest
  // of the codebase, e.g. episode_preparations.created_by).
  await dropForeignKeysOn(table, column)
  await db!.execute(
    sql.raw(`ALTER TABLE ${table} ALTER COLUMN ${column} TYPE text USING ${column}::text`),
  )
  console.log("ok")
}

async function main() {
  console.log("Khat Brain — type alignment\n")

  await alterToText("episode_intelligence_records", "created_by")
  await alterToText("eir_phase_transitions", "actor_id")

  console.log("\n✅ Types aligned with Drizzle schema.\n")
  process.exit(0)
}

main().catch((e) => {
  console.error("❌", e)
  process.exit(1)
})
