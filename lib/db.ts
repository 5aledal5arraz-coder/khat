import pg from "pg"
import { drizzle } from "drizzle-orm/node-postgres"
import * as schema from "./db/schema"

const { Pool } = pg

const dbUrl = process.env.DATABASE_URL
const isLocalhost = dbUrl?.includes("localhost")

// Strip sslmode from connection string — pg v8.x treats sslmode=require as verify-full
// which rejects self-signed certs. We handle SSL via the pool config instead.
const cleanUrl = dbUrl?.replace(/[?&]sslmode=[^&]*/g, "").replace(/\?$/, "")

// ─── Script-mode detection ──────────────────────────────────────────
// `NEXT_RUNTIME` is set by Next.js itself ("nodejs" or "edge") for every
// request/render. Its absence means we're running under tsx (a script
// or smoke), where the pool must NOT pin the event loop. Setting
// `allowExitOnIdle: true` lets `node` exit naturally once a script
// finishes its work — no more 5-day zombie smoke processes.
//
// We also use smaller defaults in script mode so concurrent smokes
// can't blow past local Postgres `max_connections=100`.
const isScriptMode = !process.env.NEXT_RUNTIME

const DEFAULT_MAX = isScriptMode ? 2 : 10
const DEFAULT_MIN = isScriptMode ? 0 : 2

const pool = cleanUrl
  ? new Pool({
      connectionString: cleanUrl,
      ...(isLocalhost ? {} : { ssl: { rejectUnauthorized: false } }),
      // Connection pool sizing
      max: parseInt(process.env.DB_POOL_MAX || String(DEFAULT_MAX), 10),
      min: parseInt(process.env.DB_POOL_MIN || String(DEFAULT_MIN), 10),
      // Return idle connections after 30s
      idleTimeoutMillis: 30_000,
      // Fail fast if pool is exhausted (don't queue forever)
      connectionTimeoutMillis: 10_000,
      // CRITICAL for script-mode hygiene: let node exit when nothing
      // else holds the loop. Without this, every smoke script hangs
      // forever after `main()` returns, holding 2-10 Postgres slots
      // idle until the OS kills the parent shell.
      allowExitOnIdle: isScriptMode,
    })
  : null

if (pool) {
  pool.on('error', (err) => {
    console.error('Unexpected database pool error:', err.message)
  })
}

const db = pool ? drizzle(pool, { schema }) : null

/**
 * Drain the pool. Scripts that explicitly `process.exit()` (e.g. after
 * an error) should call this first so backends close cleanly. Scripts
 * that simply return from `main()` don't need to — `allowExitOnIdle`
 * already lets the runtime exit naturally.
 */
export async function closeDb(): Promise<void> {
  if (pool) {
    try {
      await pool.end()
    } catch {
      // Pool may already be closed — ignore.
    }
  }
}

export { db, pool }
export const USE_DB = !!pool
