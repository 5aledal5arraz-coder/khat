/**
 * Khaled, 2026-09-26: stop market intelligence's automatic daily run; add a
 * button he presses when he needs one.
 *
 *   1. The schedule is OFF unless KHAT_MARKET_SCHEDULER_ENABLED=true — the
 *      boot bootstrap enqueues nothing, and a tick ALREADY in the queue fires
 *      once, enqueues nothing and does not re-enqueue itself (the chain ends).
 *   2. «تشغيل الآن» enqueues exactly one run through the queue, refuses to
 *      stack a second while one is pending/running, and is OWNER/ADMIN only.
 *   3. ai-runs-sweeper's schedule is untouched by the switch.
 *   4. The run-now also enqueues the daily taste decay the schedule used to
 *      run — through the same once-per-24h, never-stacked gate.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

const execute = vi.hoisted(() => vi.fn())
vi.mock("@/lib/db", () => ({ db: { execute }, pool: {}, USE_DB: true }))

const enqueueJob = vi.hoisted(() => vi.fn(async (type: string) => ({ id: `job-${type}` })))
const enqueueRecurringTick = vi.hoisted(() => vi.fn(async () => null))
vi.mock("@/lib/jobs/queue", () => ({ enqueueJob, enqueueRecurringTick }))

const requireActionRole = vi.hoisted(() => vi.fn())
vi.mock("@/lib/api-utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-utils")>()
  return { ...actual, requireActionRole }
})
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

import {
  ensureAiRunsSweeperSchedule,
  ensureMarketScheduler,
  isMarketSchedulerEnabled,
} from "@/lib/jobs/scheduler-bootstrap"
import { getHandler } from "@/lib/jobs/registry"
import type { JobContext } from "@/lib/jobs"
import "@/lib/jobs/handlers/market-intelligence"
import { enqueueMarketRunNow } from "@/lib/market-intelligence/run-now"
import { runMarketNowAction } from "@/app/admin/khat-brain/market/signals/_components/run-market-action"
import { hasRole } from "@/lib/api-utils"
import type { AdminRole } from "@/lib/admin/auth"

const inflightRows = (n: number) => ({ rows: [{ n }] })
const HOUR = 60 * 60 * 1000
/** The taste-decay gate's row: last success + how many are pending/running. */
const decayRow = (lastOkAgoMs: number | null, inflight = 0) => ({
  rows: [{ last_ok: lastOkAgoMs == null ? null : new Date(Date.now() - lastOkAgoMs).toISOString(), inflight }],
})
/** A decay that ran 1h ago — not due, so only collect is under test. */
const decayNotDue = () => decayRow(1 * HOUR)
const enqueuedTypes = () => enqueueJob.mock.calls.map((c) => c[0])

function actAs(role: AdminRole) {
  requireActionRole.mockImplementation(async (min: AdminRole) =>
    hasRole(role, min)
      ? { ok: true, user: { id: "u1", role } }
      : { ok: false, error: "ليس لديك صلاحية لهذا الإجراء" },
  )
}

const ORIGINAL = process.env.KHAT_MARKET_SCHEDULER_ENABLED
beforeEach(() => {
  vi.clearAllMocks()
  delete process.env.KHAT_MARKET_SCHEDULER_ENABLED
  execute.mockResolvedValue({ rows: [] })
})
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.KHAT_MARKET_SCHEDULER_ENABLED
  else process.env.KHAT_MARKET_SCHEDULER_ENABLED = ORIGINAL
})

describe("market schedule switch", () => {
  it("is off by default", () => {
    expect(isMarketSchedulerEnabled()).toBe(false)
  })

  it("the boot bootstrap enqueues nothing while off", async () => {
    const r = await ensureMarketScheduler()
    expect(r).toEqual({ status: "disabled", jobId: null })
    expect(execute).not.toHaveBeenCalled()
    expect(enqueueJob).not.toHaveBeenCalled()
  })

  it("still bootstraps when explicitly enabled (the code is kept, not deleted)", async () => {
    process.env.KHAT_MARKET_SCHEDULER_ENABLED = "true"
    // Bootstraps enqueue through enqueueRecurringTick (per-type lock + "no
    // pending tick" check, 2026-10-03) so two booting workers can't double it.
    enqueueRecurringTick.mockResolvedValueOnce({ id: "job-market.scheduler" } as never)
    const r = await ensureMarketScheduler()
    expect(r.status).toBe("bootstrapped")
    expect(enqueueRecurringTick).toHaveBeenCalledWith("market.scheduler", { initial: true }, expect.anything())
  })

  it("an already-queued tick fires once, enqueues nothing, and ends the chain", async () => {
    const handler = getHandler("market.scheduler")!
    const result = await handler({ initial: true }, {} as JobContext)
    expect(result).toMatchObject({ enqueued_collect: false, next_tick_at: null, disabled: true })
    expect(enqueueJob).not.toHaveBeenCalled()
    expect(enqueueRecurringTick).not.toHaveBeenCalled()
  })

  it("leaves the ai-runs-sweeper schedule alone", async () => {
    enqueueRecurringTick.mockResolvedValueOnce({ id: "job-ai-runs-sweeper" } as never)
    const r = await ensureAiRunsSweeperSchedule()
    expect(r.status).toBe("bootstrapped")
    expect(enqueueRecurringTick).toHaveBeenCalledWith("ai-runs-sweeper", expect.anything(), expect.anything())
  })
})

describe("enqueueMarketRunNow", () => {
  it("enqueues one collect run when nothing is in flight", async () => {
    execute.mockResolvedValueOnce(decayNotDue()).mockResolvedValueOnce(inflightRows(0))
    const r = await enqueueMarketRunNow()
    expect(r).toEqual({ status: "enqueued", jobId: "job-market.collect", decayEnqueued: false })
    expect(enqueueJob).toHaveBeenCalledTimes(1)
    expect(enqueueJob).toHaveBeenCalledWith(
      "market.collect",
      expect.objectContaining({ scheduled: true, trigger: "manual" }),
      expect.anything(),
    )
  })

  it("refuses to stack a second run while one is pending or running", async () => {
    execute.mockResolvedValueOnce(decayNotDue()).mockResolvedValueOnce(inflightRows(1))
    const r = await enqueueMarketRunNow()
    expect(r).toEqual({ status: "already_in_flight", decayEnqueued: false })
    expect(enqueueJob).not.toHaveBeenCalled()
  })
})

describe("enqueueMarketRunNow — the daily taste decay", () => {
  it("enqueues market.taste_decay alongside the run when none succeeded in 24h", async () => {
    execute.mockResolvedValueOnce(decayRow(25 * HOUR)).mockResolvedValueOnce(inflightRows(0))
    const r = await enqueueMarketRunNow()
    expect(r).toMatchObject({ status: "enqueued", decayEnqueued: true })
    expect(enqueuedTypes().sort()).toEqual(["market.collect", "market.taste_decay"])
    expect(enqueueJob).toHaveBeenCalledWith("market.taste_decay", { scheduled: true }, expect.anything())
  })

  it("enqueues it when it has never run", async () => {
    execute.mockResolvedValueOnce(decayRow(null)).mockResolvedValueOnce(inflightRows(0))
    expect((await enqueueMarketRunNow()).decayEnqueued).toBe(true)
    expect(enqueuedTypes()).toContain("market.taste_decay")
  })

  it("never twice a day: a decay that succeeded 2h ago is not repeated", async () => {
    execute.mockResolvedValueOnce(decayRow(2 * HOUR)).mockResolvedValueOnce(inflightRows(0))
    expect((await enqueueMarketRunNow()).decayEnqueued).toBe(false)
    expect(enqueuedTypes()).toEqual(["market.collect"])
  })

  it("never stacked: a decay already pending/running is not added again", async () => {
    execute.mockResolvedValueOnce(decayRow(null, 1)).mockResolvedValueOnce(inflightRows(0))
    expect((await enqueueMarketRunNow()).decayEnqueued).toBe(false)
    expect(enqueuedTypes()).toEqual(["market.collect"])
  })

  it("is due even while a collect run is already in flight (independent gate)", async () => {
    execute.mockResolvedValueOnce(decayRow(null)).mockResolvedValueOnce(inflightRows(1))
    const r = await enqueueMarketRunNow()
    expect(r).toEqual({ status: "already_in_flight", decayEnqueued: true })
    expect(enqueuedTypes()).toEqual(["market.taste_decay"])
  })

  it("the scheduler tick (when enabled) uses the same gate", async () => {
    process.env.KHAT_MARKET_SCHEDULER_ENABLED = "true"
    // collect-recency row, cluster row, then the decay row (not due).
    execute
      .mockResolvedValueOnce({ rows: [{ last_ok: new Date().toISOString(), inflight: 0 }] })
      .mockResolvedValueOnce({ rows: [{ last_ok: new Date().toISOString(), inflight: 0 }] })
      .mockResolvedValueOnce(decayNotDue())
    const handler = getHandler("market.scheduler")!
    const result = await handler({}, {} as JobContext)
    expect(result).toMatchObject({ enqueued_decay: false })
    expect(enqueuedTypes()).not.toContain("market.taste_decay")
  })

  it("…and the scheduler tick still enqueues a due decay", async () => {
    process.env.KHAT_MARKET_SCHEDULER_ENABLED = "true"
    execute
      .mockResolvedValueOnce({ rows: [{ last_ok: new Date().toISOString(), inflight: 0 }] })
      .mockResolvedValueOnce({ rows: [{ last_ok: new Date().toISOString(), inflight: 0 }] })
      .mockResolvedValueOnce(decayRow(30 * HOUR))
    const result = await getHandler("market.scheduler")!({}, {} as JobContext)
    expect(result).toMatchObject({ enqueued_decay: true })
    expect(enqueuedTypes()).toEqual(["market.taste_decay"])
  })
})

describe("runMarketNowAction — role gate", () => {
  for (const role of ["EDITOR", "VIEWER"] as AdminRole[]) {
    it(`refuses ${role} and enqueues nothing`, async () => {
      actAs(role)
      const r = await runMarketNowAction()
      expect(r).toMatchObject({ ok: false, status: "forbidden" })
      expect(execute).not.toHaveBeenCalled()
      expect(enqueueJob).not.toHaveBeenCalled()
    })
  }

  for (const role of ["ADMIN", "OWNER"] as AdminRole[]) {
    it(`lets ${role} enqueue a run`, async () => {
      actAs(role)
      execute.mockResolvedValueOnce(decayNotDue()).mockResolvedValueOnce(inflightRows(0))
      const r = await runMarketNowAction()
      expect(r).toMatchObject({ ok: true, status: "enqueued" })
      expect(enqueueJob).toHaveBeenCalledTimes(1)
    })
  }

  it("reports an in-flight run instead of adding one", async () => {
    actAs("OWNER")
    execute.mockResolvedValueOnce(decayNotDue()).mockResolvedValueOnce(inflightRows(2))
    const r = await runMarketNowAction()
    expect(r).toMatchObject({ ok: true, status: "already_in_flight" })
    expect(enqueueJob).not.toHaveBeenCalled()
  })
})
