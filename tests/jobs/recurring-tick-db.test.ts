/**
 * enqueueRecurringTick against the REAL jobs table (2026-10-03, noura).
 *
 * The bug: it skipped when a `running` job of the type existed — i.e. the
 * calling tick itself — so a self-rescheduling schedule died after one tick
 * (podcast.weekly_sync, partner.task_reminder, market.source_feedback,
 * youtube.audience_refresh, market.scheduler).
 *
 * Uses a unique test job type with run_after far in the future, so no worker
 * could ever claim these rows; all are deleted in afterAll. Localhost only.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import path from "node:path"
import { loadEnvFiles } from "@/lib/env-file"

loadEnvFiles()
process.env.DB_POOL_MAX = "8"

function isLocalDb(url: string | undefined): boolean {
  if (!url) return false
  try {
    const h = new URL(url).hostname
    return h === "localhost" || h === "127.0.0.1" || h === "::1" || h === "[::1]"
  } catch {
    return false
  }
}
const d = isLocalDb(process.env.DATABASE_URL) ? describe : describe.skip

const TYPE = `vitest.tick.${Date.now()}`
const FUTURE = new Date("2099-01-01T00:00:00Z")

d("enqueueRecurringTick (real DB)", () => {
  let queue: typeof import("@/lib/jobs/queue")
  let db: typeof import("@/lib/db")["db"]
  let sql: typeof import("drizzle-orm")["sql"]
  const count = async (status: string) =>
    Number(((await db!.execute(sql`SELECT count(*)::int AS n FROM jobs WHERE type = ${TYPE} AND status = ${status}`)).rows[0] as { n: number }).n)

  beforeAll(async () => {
    queue = await import("@/lib/jobs/queue")
    db = (await import("@/lib/db")).db
    sql = (await import("drizzle-orm")).sql
  })
  afterAll(async () => {
    await db?.execute(sql`DELETE FROM jobs WHERE type = ${TYPE}`)
  })

  it("a RUNNING tick (the caller itself) reschedules its next tick", async () => {
    await db!.execute(sql`
      INSERT INTO jobs (id, type, payload, status, run_after, max_attempts)
      VALUES (gen_random_uuid()::text, ${TYPE}, '{}'::jsonb, 'running', ${FUTURE.toISOString()}, 1)`)
    const next = await queue.enqueueRecurringTick(TYPE, {}, { runAfter: FUTURE, maxAttempts: 1 })
    expect(next).not.toBeNull()
    expect(await count("pending")).toBe(1)
  })

  it("a reclaimed re-run of the same tick adds nothing (one future tick)", async () => {
    expect(await queue.enqueueRecurringTick(TYPE, {}, { runAfter: FUTURE, maxAttempts: 1 })).toBeNull()
    expect(await count("pending")).toBe(1)
  })

  it("concurrent callers (two bootstraps, or a boot racing a tick) leave exactly ONE pending tick", async () => {
    await db!.execute(sql`DELETE FROM jobs WHERE type = ${TYPE} AND status = 'pending'`)
    const results = await Promise.all(Array.from({ length: 6 }, () => queue.enqueueRecurringTick(TYPE, {}, { runAfter: FUTURE, maxAttempts: 1 })))
    expect(results.filter(Boolean)).toHaveLength(1)
    expect(await count("pending")).toBe(1)
  })

  it("the check-then-insert is serialised by the per-type advisory lock (deterministic interleaving)", async () => {
    await db!.execute(sql`DELETE FROM jobs WHERE type = ${TYPE} AND status = 'pending'`)
    const { Pool } = await import("pg")
    const other = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 })
    const c = await other.connect()
    try {
      // Another session holds the lock and is about to insert the tick.
      await c.query("BEGIN")
      await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`recurring-tick:${TYPE}`])
      const racing = queue.enqueueRecurringTick(TYPE, {}, { runAfter: FUTURE, maxAttempts: 1 })
      await new Promise((r) => setTimeout(r, 300)) // racing call is now blocked on the lock
      await c.query(
        "INSERT INTO jobs (id, type, payload, status, run_after, max_attempts) VALUES (gen_random_uuid()::text, $1, '{}'::jsonb, 'pending', $2, 1)",
        [TYPE, FUTURE.toISOString()],
      )
      await c.query("COMMIT")
      // Once the lock is released the racing call must SEE that tick and add none.
      expect(await racing).toBeNull()
      expect(await count("pending")).toBe(1)
    } finally {
      c.release()
      await other.end()
    }
  })
})

describe("every scheduler goes through the fixed helper", () => {
  const ROOT = path.resolve(__dirname, "../..")
  it("the bootstraps use enqueueRecurringTick (same lock + pending check)", () => {
    const src = readFileSync(path.join(ROOT, "lib/jobs/scheduler-bootstrap.ts"), "utf8")
    expect(src).toMatch(/return \(await enqueueRecurringTick\(type, payload, options\)\) \?\? \{ id: null \}/)
  })
  it.each([
    ["lib/jobs/handlers/podcast-universe.ts", "PU_JOB_WEEKLY_SYNC"],
    ["lib/jobs/handlers/partner-task-reminder.ts", '"partner.task_reminder"'],
    ["lib/jobs/handlers/market-source-feedback.ts", '"market.source_feedback"'],
    ["lib/jobs/handlers/youtube-audience.ts", "YOUTUBE_AUDIENCE_JOB"],
    ["lib/jobs/handlers/market-intelligence.ts", '"market.scheduler"'],
  ])("%s reschedules through enqueueRecurringTick", (file, type) => {
    const src = readFileSync(path.join(ROOT, file), "utf8")
    expect(src).toMatch(new RegExp(`enqueueRecurringTick\\(\\s*${type.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`))
  })
})
