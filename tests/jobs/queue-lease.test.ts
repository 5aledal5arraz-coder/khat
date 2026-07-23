/**
 * Job queue — lease mechanics (Fix B, layer 1 + the reaper contract).
 *
 * Two halves of the "no double execution" guarantee:
 *   • reportJobProgress refreshes `locked_at` (so a live long job keeps its lease
 *     fresh) under the `status='running'` guard, WITHOUT touching `updated_at`.
 *   • reclaimStaleJobs asks Postgres for exactly "running jobs whose locked_at is
 *     older than now − lease" — the boundary that decides fresh-heartbeat (kept)
 *     vs dead-worker (reclaimed).
 *
 * The drizzle mock can't execute SQL, so the reaper's row-level verdict is
 * Postgres's job; here we (1) render the emitted SQL with the real pg dialect to
 * prove the WHERE contract + the cutoff = now − lease, and (2) prove row mapping.
 */
import { describe, it, expect, beforeEach, vi } from "vitest"
import { PgDialect } from "drizzle-orm/pg-core"

import { mockDb, resetMock } from "../db-mock"
vi.mock("@/lib/db", () => ({ db: mockDb, pool: {}, USE_DB: true }))

import { reportJobProgress, reclaimStaleJobs } from "@/lib/jobs/queue"

const dialect = new PgDialect()
/** Render a captured drizzle SQL/condition object to text + params. */
const render = (sqlObj: unknown) => dialect.sqlToQuery(sqlObj as never)

beforeEach(() => {
  resetMock()
  vi.clearAllMocks()
})

describe("reportJobProgress — heartbeat refreshes the lease under an attempts fence", () => {
  it("stamps a fresh locked_at alongside progress, and NOT updated_at", async () => {
    const before = Date.now()
    await reportJobProgress("job-1", { stage: "transcribing", fraction: 0.4 }, 2)
    const after = Date.now()

    const chain = mockDb.update.mock.results.at(-1)!.value as {
      set: ReturnType<typeof vi.fn>
      where: ReturnType<typeof vi.fn>
    }
    const setArg = chain.set.mock.calls[0][0] as Record<string, unknown>

    // progress passes through …
    expect(setArg.progress).toEqual({ stage: "transcribing", fraction: 0.4 })
    // … locked_at is refreshed to ~now …
    expect(setArg.locked_at).toBeInstanceOf(Date)
    const lockedAt = (setArg.locked_at as Date).getTime()
    expect(lockedAt).toBeGreaterThanOrEqual(before)
    expect(lockedAt).toBeLessThanOrEqual(after)
    // … and updated_at is deliberately left alone (soft signal, not a transition).
    expect(setArg).not.toHaveProperty("updated_at")
  })

  it("fences the write on id + status='running' + the claimed attempts", async () => {
    await reportJobProgress("job-1", { stage: "done" }, 2)
    const chain = mockDb.update.mock.results.at(-1)!.value as {
      where: ReturnType<typeof vi.fn>
    }
    const { sql, params } = render(chain.where.mock.calls[0][0])
    // status guard (completed/failed rows can't be revived) …
    expect(sql).toContain(`"status"`)
    expect(params).toContain("running")
    // … the id match …
    expect(params).toContain("job-1")
    // … AND the attempts fence: this write only lands while it's still attempt 2.
    expect(sql).toContain(`"attempts"`)
    expect(params).toContain(2)
  })

  it("an ORPHANED heartbeat carries its OWN stale attempt → cannot match the re-claimed row", async () => {
    // Scenario: attempt 1 timed out and the job was returned to the pool, then
    // re-claimed as attempt 2 (claimNextJob bumps attempts). The orphaned
    // attempt-1 handler is still alive and pulses with attempts=1. The mock can't
    // execute SQL, so — as with the reaper's boundary below — we prove the WHERE
    // CONTRACT: the fence renders eq(attempts, 1), which Postgres can never match
    // against the now-attempts=2 row, so the write is a no-op (no stale progress,
    // no lease revival) instead of clobbering the fresh run.
    await reportJobProgress("job-orphan", { stage: "stale-from-attempt-1" }, 1)
    const chain = mockDb.update.mock.results.at(-1)!.value as {
      where: ReturnType<typeof vi.fn>
    }
    const { sql, params } = render(chain.where.mock.calls[0][0])
    expect(sql).toContain(`"attempts"`)
    // Fences on the ORPHAN's attempt (1), not the live re-claimed attempt (2).
    expect(params).toContain(1)
    expect(params).not.toContain(2)
  })
})

describe("reclaimStaleJobs — the fresh-vs-dead boundary lives in SQL", () => {
  it("reclaims ONLY running jobs whose locked_at is older than now − lease", async () => {
    const T = new Date("2026-07-24T12:00:00.000Z").getTime()
    vi.useFakeTimers()
    vi.setSystemTime(T)
    try {
      const LEASE = 31 * 60_000
      await reclaimStaleJobs(LEASE)

      const { sql, params } = render(mockDb.execute.mock.calls[0][0])
      // running + non-null lock + strictly older than the cutoff …
      expect(sql).toContain("status = 'running'")
      expect(sql).toContain("locked_at IS NOT NULL")
      expect(sql).toContain("locked_at <")
      // … where the cutoff is exactly now − lease (so a job pulsed within the
      // lease reads as fresh and is NOT reclaimed; an older one IS).
      expect(params).toContain(new Date(T - LEASE).toISOString())
    } finally {
      vi.useRealTimers()
    }
  })

  it("surfaces the reclaimed rows Postgres returned (dead-worker jobs → pending)", async () => {
    vi.mocked(mockDb.execute).mockResolvedValueOnce({
      rows: [
        { id: "j1", type: "studio.episode_map", previous_locked_by: "worker-dead" },
      ],
    } as never)
    const out = await reclaimStaleJobs(31 * 60_000)
    expect(out).toEqual([
      { id: "j1", type: "studio.episode_map", previous_locked_by: "worker-dead" },
    ])
  })

  it("returns [] when nothing is stale (every live job kept its lease fresh)", async () => {
    vi.mocked(mockDb.execute).mockResolvedValueOnce({ rows: [] } as never)
    const out = await reclaimStaleJobs(31 * 60_000)
    expect(out).toEqual([])
  })
})
