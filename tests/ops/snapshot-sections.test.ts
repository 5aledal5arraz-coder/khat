/**
 * Wave 3 — `takeOpsSnapshot({ sections })`.
 *
 * The page used to fan out all eight sections regardless of what it
 * rendered, so nine of the ~41 Postgres round-trips per `/admin/ops` load
 * produced data that was discarded. What this file locks down:
 *
 *   1. A section that was NOT requested is not fetched — asserted against
 *      the fetcher's own dependency, not against the return shape, so the
 *      test fails if the work happens and the result is merely dropped.
 *   2. A section that was not requested is `undefined` in the result — a
 *      third state, distinct from "fetched and ok" and "fetched and
 *      failed". Those must never collapse: an unfetched section that read
 *      as a failure would paint the health band permanently unknown, and
 *      one that read as a success would let it claim green about something
 *      it never looked at.
 *   3. Each page's declared section list matches what that page renders.
 *   4. Failure containment still holds per section when a subset is asked.
 */

import { describe, expect, it, vi, beforeEach, afterAll } from "vitest"

// ─── Stub every fetcher dependency ───────────────────────────────────
// `db.execute` answers every raw query with an empty row set, which each
// fetcher's `?? 0` / `?? []` defaults absorb. We are asserting WHICH work
// runs, not what it returns.
const execute = vi.fn().mockResolvedValue({ rows: [] })
vi.mock("@/lib/db", () => ({
  db: { execute: (...a: unknown[]) => execute(...a) },
  pool: null,
  USE_DB: true,
}))

const getGuestIdentitySnapshot = vi.fn().mockResolvedValue({
  canonicalCount: 0,
  unlinkedAcceptedCandidates: 0,
  unlinkedAcceptedApplications: 0,
  duplicateGroupCount: 0,
  duplicateGuestsTotal: 0,
  recentLinkedEvents24h: 0,
  recentLinkedEventsCreatedGuest24h: 0,
  staleProfileCount: 0,
  staleDaysThreshold: 90,
})
vi.mock("@/lib/guest-identity/integrity", () => ({
  getGuestIdentitySnapshot: () => getGuestIdentitySnapshot(),
}))

const probeWorkerHeartbeat = vi
  .fn()
  .mockResolvedValue({ state: "idle", lastBeatAt: new Date(), ageMs: 0 })
vi.mock("@/lib/ops/diagnostics", () => ({
  probeWorkerHeartbeat: () => probeWorkerHeartbeat(),
}))

const listEvents = vi.fn().mockResolvedValue([])
const countBySourceSeverity = vi.fn().mockResolvedValue([])
const topErrors = vi.fn().mockResolvedValue([])
vi.mock("@/lib/system-events/queries", () => ({
  listEvents: (...a: unknown[]) => listEvents(...a),
  countBySourceSeverity: (...a: unknown[]) => countBySourceSeverity(...a),
  topErrors: (...a: unknown[]) => topErrors(...a),
}))

const countByPhase = vi.fn().mockResolvedValue({})
vi.mock("@/lib/eir/service", () => ({ countByPhase: () => countByPhase() }))

const getAiModelsDiagnostics = vi.fn().mockResolvedValue({
  tasks: [],
  catalog: { stale: false, lastError: null, refreshedAt: null, textModelCount: 1 },
})
vi.mock("@/lib/ai-router/model-selection", () => ({
  getAiModelsDiagnostics: () => getAiModelsDiagnostics(),
}))

vi.mock("@/lib/ai-router/runtime-config", () => ({
  getEffectiveLimits: vi.fn().mockResolvedValue({
    light: { maxConcurrent: 1, maxDailyCostUsd: 1 },
    expensive: { maxConcurrent: 1, maxDailyCostUsd: 1 },
  }),
  getEffectiveMode: vi.fn().mockResolvedValue("report"),
}))

import {
  takeOpsSnapshot,
  OPS_SECTIONS,
  OPS_HOME_SECTIONS,
  OPS_DETAILS_SECTIONS,
} from "@/lib/ops/snapshot"

const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
afterAll(() => errorSpy.mockRestore())
beforeEach(() => vi.clearAllMocks())

describe("takeOpsSnapshot — the sections argument", () => {
  it("defaults to every section when none is given (back-compat)", async () => {
    const snap = await takeOpsSnapshot()
    for (const k of OPS_SECTIONS) expect(snap[k]).toBeDefined()
  })

  it("returns ONLY the requested sections; the rest are undefined", async () => {
    const snap = await takeOpsSnapshot({ sections: ["queue", "worker"] as const })
    expect(snap.queue).toBeDefined()
    expect(snap.worker).toBeDefined()
    for (const k of OPS_SECTIONS) {
      if (k === "queue" || k === "worker") continue
      expect(snap[k]).toBeUndefined()
    }
  })

  it("does not RUN the fetcher for an unrequested section", async () => {
    await takeOpsSnapshot({ sections: ["queue"] as const })
    // The three that the two pages dropped.
    expect(getGuestIdentitySnapshot).not.toHaveBeenCalled()
    expect(probeWorkerHeartbeat).not.toHaveBeenCalled()
    expect(listEvents).not.toHaveBeenCalled()
    expect(countBySourceSeverity).not.toHaveBeenCalled()
    expect(countByPhase).not.toHaveBeenCalled()
  })

  it("still reports meta (taken_at / duration_ms) for a subset", async () => {
    const snap = await takeOpsSnapshot({ sections: ["queue"] as const })
    expect(snap.taken_at).toBeInstanceOf(Date)
    expect(Number.isFinite(snap.duration_ms)).toBe(true)
    expect(snap.duration_ms).toBeGreaterThanOrEqual(0)
  })

  it("dedupes a repeated section instead of running it twice", async () => {
    const snap = await takeOpsSnapshot({
      sections: ["worker", "worker", "worker"] as const,
    })
    expect(probeWorkerHeartbeat).toHaveBeenCalledTimes(1)
    expect(snap.worker).toBeDefined()
  })

  it("contains a failing section without losing its siblings", async () => {
    probeWorkerHeartbeat.mockRejectedValueOnce(new Error("heartbeat exploded"))
    const snap = await takeOpsSnapshot({ sections: ["queue", "worker"] as const })
    expect(snap.worker.ok).toBe(false)
    expect(snap.queue.ok).toBe(true)
  })
})

describe("per-page section lists", () => {
  it("the home does not fetch the three sections it never renders", async () => {
    for (const k of ["systemEvents", "recentActivity", "guestIdentity"] as const) {
      expect(OPS_HOME_SECTIONS).not.toContain(k)
    }
  })

  it("the details page does not fetch the three sections it never renders", async () => {
    for (const k of ["worker", "aiModels", "guestIdentity"] as const) {
      expect(OPS_DETAILS_SECTIONS).not.toContain(k)
    }
  })

  it("the home fetches everything its derivations read", () => {
    // deriveQueueStatus/deriveSystemHealth → queue, worker;
    // deriveAiActivity/deriveCostStatus/deriveAiAlerts → aiRouter, aiModels;
    // derivePipelineSummary → eirPipeline.
    for (const k of ["queue", "aiRouter", "eirPipeline", "worker", "aiModels"] as const) {
      expect(OPS_HOME_SECTIONS).toContain(k)
    }
  })

  it("the details page fetches all five sections it renders", () => {
    for (const k of [
      "queue",
      "systemEvents",
      "aiRouter",
      "eirPipeline",
      "recentActivity",
    ] as const) {
      expect(OPS_DETAILS_SECTIONS).toContain(k)
    }
  })

  it("neither page requests a section that does not exist", () => {
    for (const k of [...OPS_HOME_SECTIONS, ...OPS_DETAILS_SECTIONS]) {
      expect(OPS_SECTIONS).toContain(k)
    }
  })
})
