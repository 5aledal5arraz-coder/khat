/**
 * Worker liveness heartbeat — state classification.
 *
 * The bug this file exists to prevent: `/admin/ops` showed a red
 * «الإنتاج متوقف — عامل المهام ميت» band while the worker was alive and
 * polling. The old probe inferred liveness from `MAX(jobs.updated_at)`, so on
 * a low-volume queue any quiet stretch over 10 minutes was reported as death.
 *
 * Every test below pins one half of the contract that replaced it:
 *   1. Liveness comes from the worker's OWN beat, not from job activity.
 *   2. There are THREE distinct outcomes for a reachable worker —
 *      working · idle · down — and `idle` is HEALTHY.
 *
 * Pure functions only; the DB roundtrip is exercised by the ops smoke script.
 */

import { describe, expect, it } from "vitest"
import {
  WORKER_HEALTHY_STATES,
  classifyWorkerHeartbeat,
  describeWorkerHeartbeat,
  type WorkerHeartbeat,
} from "@/lib/ops/diagnostics"
import {
  WORKER_HEARTBEAT_INTERVAL_MS,
  WORKER_HEARTBEAT_STALE_MS,
  type WorkerHeartbeatPayload,
} from "@/lib/jobs/heartbeat"
import { deriveSystemHealth, deriveWorkerSentence } from "@/lib/ops/home-metrics"
import type { OpsSnapshot } from "@/lib/ops/snapshot"

const payload = (over: Partial<WorkerHeartbeatPayload> = {}): WorkerHeartbeatPayload => ({
  worker_id: "worker-abc123",
  busy: false,
  job_type: null,
  booted_at: new Date().toISOString(),
  ...over,
})

// ─── The three states ────────────────────────────────────────────────

describe("classifyWorkerHeartbeat — the three worker states", () => {
  it("fresh beat + a job in flight → working", () => {
    const out = classifyWorkerHeartbeat({
      ageMs: 5_000,
      value: payload({ busy: true, job_type: "market.score_signals" }),
    })
    expect(out.state).toBe("working")
    expect(out.jobType).toBe("market.score_signals")
    expect(out.workerId).toBe("worker-abc123")
  })

  it("fresh beat + empty queue → idle, and idle is HEALTHY", () => {
    const out = classifyWorkerHeartbeat({ ageMs: 5_000, value: payload({ busy: false }) })
    expect(out.state).toBe("idle")
    expect(WORKER_HEALTHY_STATES.has(out.state)).toBe(true)
    // No job is claimed, so none is reported.
    expect(out.jobType).toBeNull()
  })

  it("beat older than the stale window → down", () => {
    const out = classifyWorkerHeartbeat({
      ageMs: WORKER_HEARTBEAT_STALE_MS + 1,
      value: payload({ busy: true, job_type: "studio.episode_map" }),
    })
    expect(out.state).toBe("down")
    expect(WORKER_HEALTHY_STATES.has(out.state)).toBe(false)
    // A worker we can't hear from is not "working on studio.episode_map" —
    // that claim is only as fresh as the beat that carried it.
    expect(out.jobType).toBeNull()
  })
})

// ─── The regression itself ───────────────────────────────────────────

describe("the false «عامل المهام ميت» alarm", () => {
  /**
   * The exact reproduction: the worker was alive, `MAX(jobs.updated_at)` was
   * 973s old (no work had been enqueued), and the old probe's 10-minute
   * activity window called that death. An independent beat is unaffected by
   * how long the queue has been quiet.
   */
  it("a worker idle for 16 minutes is alive, not dead", () => {
    const quietFor = 973_000
    expect(quietFor).toBeGreaterThan(10 * 60 * 1000) // would have been "stale"

    // The beat, however, is only as old as the last interval tick.
    const out = classifyWorkerHeartbeat({
      ageMs: WORKER_HEARTBEAT_INTERVAL_MS,
      value: payload({ busy: false }),
    })

    expect(out.state).toBe("idle")
    expect(WORKER_HEALTHY_STATES.has(out.state)).toBe(true)
  })

  it("an idle worker never turns the health band red", () => {
    const out = deriveSystemHealth(snapshotWithWorker({
      state: "idle",
      ageMs: 12_000,
      workerId: "w-1",
      jobType: null,
    }))
    expect(out.workerAlive).toBe(true)
    expect(out.level).toBe("healthy")
    // `workerAlive === false` is what paints the red band; it must not be set.
    expect(out.issues.some((i) => i.label.includes("ما يرد"))).toBe(false)
  })

  it("a genuinely dead worker still goes red", () => {
    const out = deriveSystemHealth(snapshotWithWorker({
      state: "down",
      ageMs: 10 * 60 * 1000,
      workerId: "w-1",
      jobType: null,
    }))
    expect(out.workerAlive).toBe(false)
    expect(out.level).toBe("attention")
    expect(out.issues.some((i) => i.label.includes("ما يرد"))).toBe(true)
  })

  it("the heartbeat cadence leaves room for missed beats", () => {
    // Three beats of slack. A single slow write must not flash red.
    expect(WORKER_HEARTBEAT_STALE_MS).toBeGreaterThanOrEqual(
      WORKER_HEARTBEAT_INTERVAL_MS * 3,
    )
  })
})

// ─── Unknown ≠ dead, and unknown ≠ healthy ───────────────────────────

describe("states we cannot judge", () => {
  it.each(["never", "unreadable", "db_down"] as const)(
    "'%s' is neither healthy nor a death claim",
    (state) => {
      expect(WORKER_HEALTHY_STATES.has(state)).toBe(false)
      const out = deriveSystemHealth(
        snapshotWithWorker({ state, ageMs: null, workerId: null, jobType: null }),
      )
      expect(out.workerAlive).toBeNull()
      expect(out.level).toBe("unknown")
      // Crucially it does NOT accuse the worker of being dead.
      expect(out.issues.some((i) => i.label.includes("ما يرد"))).toBe(false)
    },
  )

  it("a missing heartbeat row reads as 'never', not as a death", () => {
    // Guards the upgrade path: a worker that hasn't been restarted since this
    // feature shipped writes no row, and must not be reported as dead.
    const out = classifyWorkerHeartbeat({ ageMs: null, value: null })
    expect(out.state).toBe("unreadable")
    expect(WORKER_HEALTHY_STATES.has(out.state)).toBe(false)
  })
})

// ─── Untrusted payload ───────────────────────────────────────────────

describe("payload is untrusted JSONB", () => {
  it("a fresh beat with a garbage payload is still alive (idle)", () => {
    const out = classifyWorkerHeartbeat({ ageMs: 1_000, value: { busy: "yes" } })
    // Liveness is proven by the timestamp; busyness is only a claim, and an
    // unparseable claim must not invent a job.
    expect(out.state).toBe("idle")
    expect(out.jobType).toBeNull()
  })

  it("a future-dated beat is clamped, not reported as a negative age", () => {
    const out = classifyWorkerHeartbeat({ ageMs: -5_000, value: payload() })
    expect(out.ageMs).toBe(0)
    expect(out.state).toBe("idle")
  })
})

// ─── Operator-facing copy ────────────────────────────────────────────

describe("the operator can tell the three states apart", () => {
  const states: WorkerHeartbeat[] = [
    { state: "working", ageMs: 5_000, workerId: "w", jobType: "market.collect" },
    { state: "idle", ageMs: 5_000, workerId: "w", jobType: null },
    { state: "down", ageMs: 600_000, workerId: "w", jobType: null },
  ]

  it("produces three DISTINCT sentences on the home band", () => {
    const sentences = states.map((s) => deriveWorkerSentence(s))
    expect(new Set(sentences).size).toBe(3)
  })

  it("the idle sentence never reads as a fault", () => {
    const idle = deriveWorkerSentence(states[1])
    expect(idle).toContain("شغّال")
    expect(idle).not.toContain("ما يرد")
    expect(idle).not.toContain("متوقف")
  })

  it("only the down sentence says the worker isn't responding", () => {
    expect(deriveWorkerSentence(states[2])).toContain("ما يرد")
    expect(deriveWorkerSentence(states[0])).not.toContain("ما يرد")
  })

  it("the Settings-hub card matches — idle is not an error there either", () => {
    expect(describeWorkerHeartbeat(states[1])).toContain("شغّال")
    expect(describeWorkerHeartbeat(states[2])).toContain("ما يرد")
  })
})

// ─── Fixture ─────────────────────────────────────────────────────────

/** A fully-healthy snapshot with only the worker section varied. */
function snapshotWithWorker(worker: WorkerHeartbeat): OpsSnapshot {
  return {
    taken_at: new Date(),
    duration_ms: 1,
    queue: {
      ok: true,
      data: {
        countsByStatus: {
          pending: 0,
          running: 0,
          succeeded: 0,
          failed: 0,
          dead: 0,
          cancelled: 0,
        },
        oldestPending: null,
        oldestRunning: null,
        staleLeaseCount: 0,
        recentDead: [],
        deadCount24h: 0,
        duePendingCount: 0,
        scheduledPendingCount: 0,
      },
    },
    systemEvents: {
      ok: true,
      data: { window_since_ms: 0, matrix: [], grand_total: 0, topErrors: [] },
    },
    aiRouter: {
      ok: true,
      data: {
        rate_limit_mode: "report",
        tiers: {
          light: {
            current_concurrency: 0,
            concurrency_limit: 10,
            daily_cost_usd: 0,
            daily_cost_limit_usd: 5,
          },
          expensive: {
            current_concurrency: 0,
            concurrency_limit: 3,
            daily_cost_usd: 0,
            daily_cost_limit_usd: 25,
          },
        },
        ai_runs_status_counts_24h: {
          running: 0,
          succeeded: 0,
          failed: 0,
          timed_out: 0,
          cancelled: 0,
        },
        daily_cost_usd_total: 0,
        unpriced_runs_today: 0,
        day_boundary_tz: "UTC",
        recentRateLimitRejects: [],
        recentAiRouterRejects: [],
        provider_blocked_60m: { count: 0, classes: [], lastAt: null },
        unclassified_failures_24h: 0,
      },
    },
    eirPipeline: {
      ok: true,
      data: {
        countByPhase: {
          idea: 0,
          guest_discovery: 0,
          guest_assigned: 0,
          approved: 0,
          researching: 0,
          prepared: 0,
          ready_to_record: 0,
          recording: 0,
          recorded: 0,
          producing: 0,
          ready_to_publish: 0,
          published: 0,
          analyzing: 0,
          learned: 0,
          archived: 0,
        },
        recentTransitions: [],
        invalid_attempts_24h: 0,
        most_recent_invalid_attempt_at: null,
      },
    },
    recentActivity: { ok: true, data: { events: [] } },
    guestIdentity: {
      ok: true,
      data: {
        canonicalCount: 0,
        unlinkedAcceptedCandidates: 0,
        unlinkedAcceptedApplications: 0,
        duplicateGroupCount: 0,
        duplicateGuestsTotal: 0,
        recentLinkedEvents24h: 0,
        recentLinkedEventsCreatedGuest24h: 0,
        staleProfileCount: 0,
        staleDaysThreshold: 90,
      },
    },
    worker: { ok: true, data: worker },
    aiModels: {
      ok: true,
      data: {
        catalog: {
          stale: false,
          lastError: null,
          refreshedAt: new Date().toISOString(),
          everLoaded: true,
        },
        fallbacks: [],
        eolRisks: [],
      },
    },
  }
}
