/**
 * Applies pending Drizzle migrations using drizzle-orm's IN-PROCESS migrator
 * instead of the `drizzle-kit migrate` CLI.
 *
 * Why this exists: `drizzle-kit migrate` reliably hangs on
 * "[⣷] applying migrations..." when run over a non-interactive SSH session
 * against the managed database — no error, no ledger row, exit 1. The
 * in-process migrator does exactly the same work (reads
 * `drizzle/migrations/meta/_journal.json`, applies each pending file inside one
 * transaction, and records `hash` + `created_at` in
 * `drizzle.__drizzle_migrations` itself), so the ledger stays authoritative and
 * nothing has to be written by hand — hand-written ledger rows are what
 * corrupted this project's migration history before.
 *
 * Usage (production requires the explicit target, same guard as drizzle.config):
 *   KHAT_DB_TARGET=production npx tsx scripts/migrate-node.ts
 */

import { loadEnvFiles } from "../lib/env-file"

loadEnvFiles()

import pg from "pg"
import { drizzle } from "drizzle-orm/node-postgres"
import { migrate } from "drizzle-orm/node-postgres/migrator"

const rawUrl = process.env.DATABASE_URL
if (!rawUrl) {
  console.error("[migrate-node] DATABASE_URL is not set.")
  process.exit(1)
}

const host = (() => {
  try {
    return new URL(rawUrl).hostname
  } catch {
    return ""
  }
})()
const isLocal = host === "localhost" || host === "127.0.0.1" || host === "::1"

// Same fail-closed guard as drizzle.config.ts: `.env.local` also holds
// LIVE_DATABASE_URL, so a stray export must not silently migrate production.
if (!isLocal && process.env.KHAT_DB_TARGET !== "production") {
  console.error(
    `[migrate-node] Refusing to run against a NON-LOCAL database (host: ${host || "<unparseable>"}).\n` +
      "  Re-run with an explicit target if this is intentional:\n" +
      "    KHAT_DB_TARGET=production npx tsx scripts/migrate-node.ts",
  )
  process.exit(1)
}

// pg v8 treats `sslmode=require` as verify-full and rejects the managed DB's
// self-signed cert; SSL is configured explicitly instead (mirrors lib/db.ts).
const url = rawUrl.replace(/[?&]sslmode=[^&]*/g, "").replace(/\?$/, "")

async function main() {
  const client = new pg.Client({
    connectionString: url,
    ssl: isLocal ? undefined : { rejectUnauthorized: false },
    // Fail loudly instead of hanging the way drizzle-kit does.
    connectionTimeoutMillis: 15_000,
    statement_timeout: 120_000,
  })

  console.log(`[migrate-node] connecting to ${host}…`)
  await client.connect()

  const before = await client.query("select count(*)::int as n from drizzle.__drizzle_migrations")
  console.log(`[migrate-node] ledger before: ${before.rows[0].n}`)

  const db = drizzle(client)
  await migrate(db, { migrationsFolder: "./drizzle/migrations" })

  const after = await client.query(
    "select id, hash, created_at from drizzle.__drizzle_migrations order by id desc limit 5",
  )
  const total = await client.query("select count(*)::int as n from drizzle.__drizzle_migrations")
  console.log(`[migrate-node] ledger after: ${total.rows[0].n}`)
  for (const r of after.rows.reverse()) {
    console.log(`  id=${r.id} created_at=${r.created_at} hash=${String(r.hash).slice(0, 12)}…`)
  }

  await client.end()
  console.log("[migrate-node] done.")
}

main().catch((err) => {
  console.error("[migrate-node] FAILED:", err instanceof Error ? err.message : err)
  process.exit(1)
})
