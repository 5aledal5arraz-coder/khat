/**
 * `/admin/ops` home — honest-numbers derivations.
 *
 * Pure unit tests. No DB, no React. Each block below pins one of the
 * dishonest behaviours the home dashboard used to have, so a regression
 * fails the static gate instead of quietly reassuring the operator.
 */

import { describe, expect, it } from "vitest"
import {
  STALLED_PENDING_MS,
  deriveAiActivity,
  deriveAiHealthSentence,
  deriveAiHint,
  deriveCostCapLine,
  deriveCostStatus,
  deriveQueueStatus,
  deriveSystemHealth,
} from "@/lib/ops/home-metrics"
import type { AiRouterSnapshot, OpsSnapshot, QueueHealth } from "@/lib/ops/snapshot"
import type { WorkerHeartbeat } from "@/lib/ops/diagnostics"
import type { AiRunStatus } from "@/lib/db/schema/ai-runs"
import type { RateLimitMode } from "@/lib/db/schema/ai-rate-limit-events"
import { EPISODE_PHASES, type EpisodePhase } from "@/lib/db/schema/eir"

// ─── Fixtures ────────────────────────────────────────────────────────

function makeAi(over: {
  statuses?: Partial<Record<AiRunStatus, number>>
  mode?: RateLimitMode
  lightCost?: number
  lightCap?: number
  expensiveCost?: number
  expensiveCap?: number
  totalCost?: number
  unpriced?: number
  tz?: string | null
} = {}): AiRouterSnapshot {
  return {
    rate_limit_mode: over.mode ?? "report",
    tiers: {
      light: {
        current_concurrency: 0,
        concurrency_limit: 10,
        daily_cost_usd: over.lightCost ?? 0,
        daily_cost_limit_usd: over.lightCap ?? 5,
      },
      expensive: {
        current_concurrency: 0,
        concurrency_limit: 3,
        daily_cost_usd: over.expensiveCost ?? 0,
        daily_cost_limit_usd: over.expensiveCap ?? 25,
      },
    },
    ai_runs_status_counts_24h: {
      running: 0,
      succeeded: 0,
      failed: 0,
      timed_out: 0,
      cancelled: 0,
      ...over.statuses,
    },
    daily_cost_usd_total: over.totalCost ?? 0,
    unpriced_runs_today: over.unpriced ?? 0,
    // `=== undefined` (not `??`) so a test can pin an explicit null tz.
    day_boundary_tz: over.tz === undefined ? "UTC" : over.tz,
    recentRateLimitRejects: [],
    recentAiRouterRejects: [],
  }
}

function makeQueue(over: Partial<QueueHealth> = {}): QueueHealth {
  return {
    countsByStatus: {
      pending: 0,
      running: 0,
      succeeded: 0,
      failed: 0,
      dead: 0,
      cancelled: 0,
      ...over.countsByStatus,
    },
    oldestPending: over.oldestPending ?? null,
    oldestRunning: over.oldestRunning ?? null,
    staleLeaseCount: over.staleLeaseCount ?? 0,
    recentDead: over.recentDead ?? [],
    deadCount24h: over.deadCount24h ?? 0,
    duePendingCount: over.duePendingCount ?? 0,
    scheduledPendingCount: over.scheduledPendingCount ?? 0,
  }
}

function pending(ageMs: number): QueueHealth["oldestPending"] {
  return {
    id: "job-1",
    type: "ai-runs-sweeper",
    run_after: new Date(Date.now() - ageMs),
    age_ms: ageMs,
  }
}

/** A worker heartbeat section. Defaults to a LIVE worker so the baseline
 *  snapshot can still be "healthy" — every green assertion below is
 *  therefore explicitly buying proof of life. */
const workerSection = (
  hb: WorkerHeartbeat = { state: "working", ageMs: 30_000, workerId: "w-1", jobType: "demo.echo" },
): OpsSnapshot["worker"] => ({ ok: true, data: hb })

/** Shorthand for a heartbeat in a given state. */
const hb = (
  state: WorkerHeartbeat["state"],
  ageMs: number | null = null,
): WorkerHeartbeat => ({ state, ageMs, workerId: "w-1", jobType: null })

const okSnapshot = (over: Partial<OpsSnapshot> = {}): OpsSnapshot => ({
  taken_at: new Date(),
  duration_ms: 1,
  queue: { ok: true, data: makeQueue() },
  systemEvents: {
    ok: true,
    data: { window_since_ms: 0, matrix: [], grand_total: 0, topErrors: [] },
  },
  aiRouter: { ok: true, data: makeAi() },
  eirPipeline: {
    ok: true,
    data: {
      countByPhase: Object.fromEntries(EPISODE_PHASES.map((p) => [p, 0])) as Record<
        EpisodePhase,
        number
      >,
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
  worker: workerSection(),
  ...over,
})

// ─── deriveAiActivity ────────────────────────────────────────────────

describe("deriveAiActivity", () => {
  it("zero runs → 'no_data', NOT 'clean' (silence is not success)", () => {
    const out = deriveAiActivity(makeAi())
    expect(out.total24h).toBe(0)
    expect(out.failed).toBe(0)
    expect(out.state).toBe("no_data")
    expect(out.state).not.toBe("clean")
  })

  it("null section → 'unavailable'", () => {
    expect(deriveAiActivity(null).state).toBe("unavailable")
  })

  it("total24h counts cancelled and running too (both used to vanish)", () => {
    const out = deriveAiActivity(
      makeAi({ statuses: { succeeded: 3, cancelled: 2, running: 1 } }),
    )
    expect(out.total24h).toBe(6)
    expect(out.succeeded).toBe(3)
    expect(out.running).toBe(1)
    expect(out.state).toBe("clean")
  })

  it("failed merges failed + timed_out → 'has_failures'", () => {
    const out = deriveAiActivity(
      makeAi({ statuses: { succeeded: 10, failed: 2, timed_out: 3 } }),
    )
    expect(out.failed).toBe(5)
    expect(out.total24h).toBe(15)
    expect(out.state).toBe("has_failures")
  })

  it("only running calls → 'in_flight', NOT 'clean' (nothing finished yet)", () => {
    const out = deriveAiActivity(makeAi({ statuses: { running: 2 } }))
    expect(out.succeeded).toBe(0)
    expect(out.failed).toBe(0)
    expect(out.running).toBe(2)
    expect(out.state).toBe("in_flight")
    expect(out.state).not.toBe("clean")
  })

  it("a success alongside a running call is still 'clean'", () => {
    const out = deriveAiActivity(makeAi({ statuses: { succeeded: 1, running: 1 } }))
    expect(out.state).toBe("clean")
  })

  it("a failure wins over in-flight — running calls never mask a failure", () => {
    const out = deriveAiActivity(makeAi({ statuses: { running: 3, failed: 1 } }))
    expect(out.state).toBe("has_failures")
  })
})

// ─── AI wording ──────────────────────────────────────────────────────

describe("deriveAiHint / deriveAiHealthSentence", () => {
  it("in_flight never claims success", () => {
    const ai = deriveAiActivity(makeAi({ statuses: { running: 2 } }))
    const hint = deriveAiHint(ai)
    expect(hint).toBe("2 استدعاء قيد التنفيذ — ما خلص شي بعد")
    expect(hint).not.toContain("نجح")
    const sentence = deriveAiHealthSentence(ai)
    expect(sentence).toBe("2 استدعاء ذكاء اصطناعي قيد التنفيذ")
    expect(sentence).not.toContain("بلا أخطاء")
  })

  it("'كلها نجحت' only when every call in the window succeeded", () => {
    expect(deriveAiHint(deriveAiActivity(makeAi({ statuses: { succeeded: 4 } })))).toBe(
      "كلها نجحت",
    )
  })

  it("a still-running call is never folded into 'كلها نجحت'", () => {
    const ai = deriveAiActivity(makeAi({ statuses: { succeeded: 3, running: 1 } }))
    expect(deriveAiHint(ai)).not.toBe("كلها نجحت")
    expect(deriveAiHint(ai)).toBe("3 نجحت · 1 قيد التنفيذ")
    expect(deriveAiHealthSentence(ai)).toContain("لسه شغّال")
  })

  it("a cancelled-only window is not reported as all-succeeded", () => {
    const ai = deriveAiActivity(makeAi({ statuses: { cancelled: 2 } }))
    expect(ai.state).toBe("clean")
    expect(deriveAiHint(ai)).not.toBe("كلها نجحت")
  })

  it("no_data / unavailable keep their neutral wording", () => {
    expect(deriveAiHint(deriveAiActivity(makeAi()))).toBe("ما صار أي استدعاء خلال 24 ساعة")
    // `unavailable` names the failure instead of dropping the hint —
    // the tile's "—" must never be left unexplained.
    expect(deriveAiHint(deriveAiActivity(null))).toBe("تعذّر قراءة سجل الاستدعاءات")
  })

  it("failures are reported as failures", () => {
    expect(
      deriveAiHint(deriveAiActivity(makeAi({ statuses: { succeeded: 1, failed: 2 } }))),
    ).toBe("2 فشل خلال 24 ساعة")
  })

  // Western digits everywhere — `lib/ops/format.ts` §11: "Western digits
  // (not Arabic-Indic) for technical readability". A single ٢٤ next to
  // "21 يوم" and "$30.00" on the same card broke that.
  it("uses Western digits, never Arabic-Indic", () => {
    const arabicIndic = /[٠-٩]/
    for (const ai of [
      deriveAiActivity(null),
      deriveAiActivity(makeAi()),
      deriveAiActivity(makeAi({ statuses: { running: 2 } })),
      deriveAiActivity(makeAi({ statuses: { succeeded: 4 } })),
      deriveAiActivity(makeAi({ statuses: { succeeded: 1, failed: 2 } })),
    ]) {
      expect(deriveAiHint(ai)).not.toMatch(arabicIndic)
      expect(deriveAiHealthSentence(ai)).not.toMatch(arabicIndic)
    }
  })
})

// ─── deriveCostStatus ────────────────────────────────────────────────

describe("deriveCostStatus", () => {
  it("pct is the WORST tier's utilisation, not the combined ratio", () => {
    // light pinned at its cap; expensive barely touched. A combined
    // ratio would report 6/30 = 20% and read as safe.
    const out = deriveCostStatus(
      makeAi({
        mode: "enforce",
        lightCost: 5,
        lightCap: 5,
        expensiveCost: 1,
        expensiveCap: 25,
        totalCost: 6,
      }),
    )
    expect(out.pct).toBe(100)
    expect(out.level).not.toBe("ok")
    expect(out.level).toBe("danger")
  })

  it("report mode downgrades danger → warn (a sleeping cap never goes red)", () => {
    const out = deriveCostStatus(
      makeAi({ mode: "report", lightCost: 5, lightCap: 5, totalCost: 5 }),
    )
    expect(out.pct).toBe(100)
    expect(out.level).toBe("warn")
    expect(out.mode).toBe("report")
  })

  it("off mode also downgrades danger → warn", () => {
    const out = deriveCostStatus(
      makeAi({ mode: "off", lightCost: 9, lightCap: 5, totalCost: 9 }),
    )
    expect(out.level).toBe("warn")
  })

  it("totalUsd comes from daily_cost_usd_total, not the tier sum", () => {
    // Tiers sum to $2 (the 6 routed kinds); the table really holds $9
    // once transcription/embedding/research_* are counted.
    const out = deriveCostStatus(
      makeAi({ lightCost: 1, expensiveCost: 1, totalCost: 9 }),
    )
    expect(out.totalUsd).toBe(9)
  })

  it("surfaces the unpriced-run count and the day-boundary timezone", () => {
    const out = deriveCostStatus(makeAi({ unpriced: 20, tz: "Etc/UTC", totalCost: 3 }))
    expect(out.unpricedCount).toBe(20)
    expect(out.tz).toBe("Etc/UTC")
  })

  it("a non-positive cap contributes no percentage (no divide-by-zero)", () => {
    const out = deriveCostStatus(
      makeAi({ lightCap: 0, expensiveCap: 0, lightCost: 4, totalCost: 4 }),
    )
    expect(out.pct).toBeNull()
    expect(out.level).toBe("ok")
  })

  it("below 75% stays ok; 75–89% warns", () => {
    expect(
      deriveCostStatus(makeAi({ mode: "enforce", lightCost: 2, lightCap: 5 })).level,
    ).toBe("ok")
    expect(
      deriveCostStatus(makeAi({ mode: "enforce", lightCost: 4, lightCap: 5 })).level,
    ).toBe("warn")
  })

  it("null section → all-null, no fabricated zero cost", () => {
    const out = deriveCostStatus(null)
    expect(out.totalUsd).toBeNull()
    expect(out.pct).toBeNull()
    expect(out.mode).toBeNull()
  })

  it("a missing timezone stays null — no guessed 'UTC'", () => {
    expect(deriveCostStatus(makeAi({ tz: null })).tz).toBeNull()
  })
})

// ─── deriveCostCapLine ───────────────────────────────────────────────

describe("deriveCostCapLine", () => {
  it("enforce + null pct prints NO percentage (it used to print '0% من السقف')", () => {
    const cost = deriveCostStatus(
      makeAi({ mode: "enforce", lightCap: 0, expensiveCap: 0, lightCost: 4, totalCost: 4 }),
    )
    expect(cost.pct).toBeNull()
    const line = deriveCostCapLine(cost)
    expect(line).toBe("نسبة السقف غير متاحة")
    expect(line).not.toContain("0%")
    expect(line).not.toContain("%")
  })

  it("enforce + a real pct prints the percentage and the cap", () => {
    const cost = deriveCostStatus(
      makeAi({ mode: "enforce", lightCost: 4, lightCap: 5, expensiveCap: 25 }),
    )
    expect(deriveCostCapLine(cost)).toBe("80% من السقف ($30.00)")
  })

  it("report mode is never phrased as a limit", () => {
    const cost = deriveCostStatus(makeAi({ mode: "report", lightCap: 5, expensiveCap: 25 }))
    expect(deriveCostCapLine(cost)).toBe("السقف $30.00 للمراقبة فقط — ما يوقف شي")
  })

  it("an unusable cap is never printed as '$0.00'", () => {
    const cost = deriveCostStatus(
      makeAi({ mode: "report", lightCap: 0, expensiveCap: 0 }),
    )
    expect(deriveCostCapLine(cost)).toBe("بلا سقف صالح — للمراقبة فقط")
  })

  it("off → no cap claim at all; unavailable section → no line", () => {
    expect(deriveCostCapLine(deriveCostStatus(makeAi({ mode: "off" })))).toBe("بلا سقف مفعّل")
    expect(deriveCostCapLine(deriveCostStatus(null))).toBeNull()
  })
})

// ─── deriveQueueStatus ───────────────────────────────────────────────

describe("deriveQueueStatus", () => {
  it("a 21-day-old pending job is stalled", () => {
    const out = deriveQueueStatus(
      makeQueue({ duePendingCount: 1, oldestPending: pending(21 * 24 * 60 * 60 * 1000) }),
    )
    expect(out.stalled).toBe(true)
  })

  it("a 5-minute-old pending job is not stalled", () => {
    const out = deriveQueueStatus(
      makeQueue({ duePendingCount: 1, oldestPending: pending(5 * 60 * 1000) }),
    )
    expect(out.stalled).toBe(false)
    expect(STALLED_PENDING_MS).toBe(60 * 60 * 1000)
  })

  it("dueNow excludes jobs scheduled for the future", () => {
    const out = deriveQueueStatus(
      makeQueue({
        countsByStatus: { pending: 9, running: 2, succeeded: 0, failed: 0, dead: 0, cancelled: 0 },
        duePendingCount: 1,
        scheduledPendingCount: 8,
      }),
    )
    expect(out.dueNow).toBe(1)
    expect(out.scheduled).toBe(8)
    expect(out.running).toBe(2)
  })

  it("deadCount24h is the true count, not the capped display list length", () => {
    const out = deriveQueueStatus(
      makeQueue({
        deadCount24h: 40,
        recentDead: Array.from({ length: 5 }, (_, i) => ({
          id: `d${i}`,
          type: "discovery-v2",
          attempts: 3,
          max_attempts: 3,
          completed_at: null,
          error_message: null,
        })),
      }),
    )
    expect(out.deadCount24h).toBe(40)
  })

  it("null section → nulls and stalled=false", () => {
    const out = deriveQueueStatus(null)
    expect(out.dueNow).toBeNull()
    expect(out.deadCount24h).toBeNull()
    expect(out.stalled).toBe(false)
  })
})

// ─── deriveSystemHealth ──────────────────────────────────────────────

describe("deriveSystemHealth", () => {
  it("all six sections ok + no issues → healthy", () => {
    const out = deriveSystemHealth(okSnapshot())
    expect(out.allSectionsOk).toBe(true)
    expect(out.level).toBe("healthy")
    expect(out.issues).toEqual([])
  })

  it("a failed guestIdentity section alone → unknown (it used to be ignored)", () => {
    const out = deriveSystemHealth(
      okSnapshot({ guestIdentity: { ok: false, error: "boom", errorRef: "00000000" } }),
    )
    expect(out.allSectionsOk).toBe(false)
    expect(out.level).toBe("unknown")
  })

  it.each([
    "systemEvents",
    "eirPipeline",
    "recentActivity",
    "guestIdentity",
    "queue",
    "aiRouter",
  ] as const)("a failed %s section → unknown", (section) => {
    const out = deriveSystemHealth(
      okSnapshot({
        [section]: { ok: false, error: "boom", errorRef: "00000000" },
      } as Partial<OpsSnapshot>),
    )
    expect(out.level).toBe("unknown")
  })

  it("a stalled queue becomes an issue with a humanized age", () => {
    const out = deriveSystemHealth(
      okSnapshot({
        queue: {
          ok: true,
          data: makeQueue({
            duePendingCount: 1,
            oldestPending: pending(21 * 24 * 60 * 60 * 1000),
          }),
        },
      }),
    )
    expect(out.level).toBe("attention")
    const stalledIssue = out.issues.find((i) => i.label.includes("الطابور متوقّف"))
    expect(stalledIssue).toBeDefined()
    expect(String(stalledIssue?.value)).toContain("21")
  })

  it("AI 'no_data' is NOT an issue — it stays neutral, not amber", () => {
    const out = deriveSystemHealth(okSnapshot())
    expect(deriveAiActivity(makeAi()).state).toBe("no_data")
    expect(out.issues.some((i) => i.label.includes("الذكاء الاصطناعي"))).toBe(false)
    expect(out.level).toBe("healthy")
  })

  it("uses the true dead count in the issue chip, not the capped list", () => {
    const out = deriveSystemHealth(
      okSnapshot({ queue: { ok: true, data: makeQueue({ deadCount24h: 40 }) } }),
    )
    const dead = out.issues.find((i) => i.label === "مهام متعثّرة")
    expect(dead?.value).toBe(40)
  })

  it("AI failures raise an attention issue", () => {
    const out = deriveSystemHealth(
      okSnapshot({
        aiRouter: { ok: true, data: makeAi({ statuses: { succeeded: 1, failed: 2 } }) },
      }),
    )
    expect(out.level).toBe("attention")
    expect(out.issues.find((i) => i.label.includes("فشل"))?.value).toBe(2)
  })

  it("a failed worker section → unknown", () => {
    const out = deriveSystemHealth(
      okSnapshot({ worker: { ok: false, error: "boom", errorRef: "00000000" } }),
    )
    expect(out.allSectionsOk).toBe(false)
    expect(out.workerAlive).toBeNull()
    expect(out.level).toBe("unknown")
  })

  // The Wave-1 bug, from the other door: a dead worker enqueues nothing, so
  // every OTHER section goes quiet and the band used to read all-green.
  it.each(["never", "unreadable", "db_down"] as const)(
    "worker heartbeat '%s' can NEVER be healthy — it's unknown",
    (state) => {
      const out = deriveSystemHealth(
        okSnapshot({ worker: workerSection(hb(state)) }),
      )
      // Everything else is perfectly quiet and perfectly resolved…
      expect(out.allSectionsOk).toBe(true)
      expect(out.issues).toEqual([])
      // …and it is STILL not green.
      expect(out.workerAlive).toBeNull()
      expect(out.level).toBe("unknown")
      expect(out.level).not.toBe("healthy")
    },
  )

  it("a stale heartbeat is an issue naming the last beat's age", () => {
    const out = deriveSystemHealth(
      okSnapshot({
        worker: workerSection(hb("down", 21 * 24 * 60 * 60 * 1000)),
      }),
    )
    expect(out.workerAlive).toBe(false)
    expect(out.level).toBe("attention")
    const issue = out.issues.find((i) => i.label.includes("العامل (worker) ما يرد"))
    expect(issue).toBeDefined()
    expect(String(issue?.value)).toContain("21")
  })

  it("the real local state: dead worker + stalled queue → BOTH issues", () => {
    const out = deriveSystemHealth(
      okSnapshot({
        worker: workerSection(hb("down", 21 * 24 * 60 * 60 * 1000)),
        queue: {
          ok: true,
          data: makeQueue({
            duePendingCount: 1,
            oldestPending: pending(21 * 24 * 60 * 60 * 1000),
          }),
        },
      }),
    )
    expect(out.level).toBe("attention")
    expect(out.issues).toHaveLength(2)
    expect(out.issues.some((i) => i.label.includes("العامل (worker) ما يرد"))).toBe(true)
    expect(out.issues.some((i) => i.label.includes("الطابور متوقّف"))).toBe(true)
  })

  it("green requires a CONFIRMED-live worker", () => {
    const out = deriveSystemHealth(okSnapshot())
    expect(out.workerAlive).toBe(true)
    expect(out.level).toBe("healthy")
  })
})
