/**
 * Baseline an EXISTING database into the Drizzle migration system.
 *
 * Run this ONCE per environment whose schema already matches the code
 * (production, or a local DB already at the current schema). It records every
 * migration in drizzle/migrations/meta/_journal.json as "already applied" so
 * `npm run db:migrate` won't try to re-create tables that exist — it will only
 * apply migrations authored AFTER this baseline.
 *
 * It writes the same rows `drizzle-kit migrate` writes — verified against this
 * drizzle-kit version: hash = sha256(raw .sql file), created_at = journal `when`.
 * Idempotent: re-running skips migrations already recorded.
 *
 * SAFETY: refuses to run unless the `episodes` table already exists, i.e. it
 * only baselines a DB that genuinely has the schema. It NEVER creates app
 * tables. For a brand-new/empty DB, use `npm run db:migrate` instead.
 *
 * Usage:
 *   DATABASE_URL="postgres://..." npx tsx scripts/adopt-migrations.ts
 */
import { readFileSync } from "fs"
import path from "path"
import { createHash } from "crypto"
import pg from "pg"

const url = process.env.DATABASE_URL
if (!url) {
  console.error("Missing DATABASE_URL")
  process.exit(1)
}
const cleanUrl = url.replace(/[?&]sslmode=[^&]*/g, "").replace(/\?$/, "")
const isLocal = url.includes("localhost") || url.includes("127.0.0.1")
const MIG_DIR = path.resolve("drizzle/migrations")

interface JournalEntry {
  idx: number
  when: number
  tag: string
}

async function main() {
  const journal = JSON.parse(
    readFileSync(path.join(MIG_DIR, "meta/_journal.json"), "utf8"),
  ) as { entries?: JournalEntry[] }
  const entries = journal.entries ?? []
  if (entries.length === 0) {
    console.error("No migrations in journal — nothing to baseline.")
    process.exit(1)
  }

  const client = new pg.Client({
    connectionString: cleanUrl,
    ...(isLocal ? {} : { ssl: { rejectUnauthorized: false } }),
  })
  await client.connect()
  const dbName = (await client.query("SELECT current_database() AS db")).rows[0].db

  const sentinel = await client.query(
    `SELECT 1 FROM information_schema.tables WHERE table_name='episodes' AND table_schema='public'`,
  )
  if (!sentinel.rowCount) {
    console.error(
      `ABORT: database "${dbName}" has no "episodes" table — it is not at the schema. ` +
        `Use \`npm run db:migrate\` to build a fresh database instead of baselining it.`,
    )
    await client.end()
    process.exit(1)
  }

  await client.query(`CREATE SCHEMA IF NOT EXISTS drizzle`)
  await client.query(
    `CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint)`,
  )

  let marked = 0
  let skipped = 0
  for (const e of entries) {
    const sql = readFileSync(path.join(MIG_DIR, `${e.tag}.sql`), "utf8")
    const hash = createHash("sha256").update(sql).digest("hex")
    const exists = await client.query(
      `SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash=$1`,
      [hash],
    )
    if (exists.rowCount) {
      skipped++
      continue
    }
    await client.query(
      `INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)`,
      [hash, String(e.when)],
    )
    marked++
    console.log(`  marked applied: ${e.tag}`)
  }

  console.log(
    `Baselined "${dbName}": ${marked} migration(s) marked applied, ${skipped} already recorded.`,
  )
  console.log(`Future \`npm run db:migrate\` will apply only migrations newer than these.`)
  await client.end()
}

main().catch((err) => {
  console.error("FAILED:", err instanceof Error ? err.message : err)
  process.exit(1)
})
