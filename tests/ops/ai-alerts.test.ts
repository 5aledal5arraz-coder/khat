/**
 * The five silent-failure alerts on the admin home.
 *
 * Each one exists because a real condition could hold indefinitely while
 * every visible signal stayed green. So each gets the SAME pair of tests:
 * it fires when the condition holds, and it is ABSENT when it doesn't.
 * The absence half is the one that matters most — an alert that renders
 * unconditionally is a banner, and a banner that is always there is
 * furniture the operator has already stopped seeing.
 *
 * Pure: `deriveAiAlerts` reads a plain `OpsSnapshot`. No DB, no React.
 */

import fs from "fs"
import path from "path"
import { describe, expect, it } from "vitest"
import {
  BUDGET_ALERT_PCT,
  RETRIEVAL_BLIND_MIN_RUNS,
  deriveAiAlerts,
  deriveSystemHealth,
  type AiAlertId,
} from "@/lib/ops/home-metrics"
import type {
  AiModelHealth,
  AiRouterSnapshot,
  OpsSnapshot,
} from "@/lib/ops/snapshot"
import type { RateLimitMode } from "@/lib/db/schema/ai-rate-limit-events"
import { EPISODE_PHASES, type EpisodePhase } from "@/lib/db/schema/eir"

// ─── Fixtures — a snapshot where NOTHING is wrong ────────────────────

function makeAi(over: Partial<AiRouterSnapshot> = {}): AiRouterSnapshot {
  return {
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
      succeeded: 3,
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
    // Healthy default: retrieval ran and every search actually searched.
    retrieval_24h: { runs: 8, blind: 0, lastBlindAt: null },
    ...over,
  }
}

/** Cost at a given % of the EXPENSIVE tier cap (the binding constraint). */
function aiAtCostPct(pct: number, mode: RateLimitMode): AiRouterSnapshot {
  const cap = 25
  return makeAi({
    rate_limit_mode: mode,
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
        daily_cost_usd: (cap * pct) / 100,
        daily_cost_limit_usd: cap,
      },
    },
  })
}

function makeModels(over: Partial<AiModelHealth> = {}): AiModelHealth {
  return {
    catalog: {
      stale: false,
      lastError: null,
      refreshedAt: "2026-07-26T00:00:00.000Z",
      everLoaded: true,
      ...over.catalog,
    },
    fallbacks: over.fallbacks ?? [],
    eolRisks: over.eolRisks ?? [],
  }
}

function snapshot(over: Partial<OpsSnapshot> = {}): OpsSnapshot {
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
    aiRouter: { ok: true, data: makeAi() },
    eirPipeline: {
      ok: true,
      data: {
        countByPhase: Object.fromEntries(
          EPISODE_PHASES.map((p) => [p, 0]),
        ) as Record<EpisodePhase, number>,
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
    worker: {
      ok: true,
      data: { state: "idle", ageMs: 5_000, workerId: "w-1", jobType: null },
    },
    aiModels: { ok: true, data: makeModels() },
    ...over,
  }
}

const ids = (snap: OpsSnapshot, includeCost = true): AiAlertId[] =>
  deriveAiAlerts(snap, { includeCost }).map((a) => a.id)

// ─── The baseline: a healthy system shows NOTHING ────────────────────

describe("exceptions-first", () => {
  it("a healthy snapshot produces zero alerts — no permanent banner", () => {
    expect(deriveAiAlerts(snapshot(), { includeCost: true })).toEqual([])
  })

  it("zero alerts leaves the health band green", () => {
    const snap = snapshot()
    const health = deriveSystemHealth(snap, {
      aiAlerts: deriveAiAlerts(snap, { includeCost: true }),
    })
    expect(health.level).toBe("healthy")
    expect(health.hasCritical).toBe(false)
  })
})

// ─── (أ) Provider blocked — quota gone / key rejected ────────────────

describe("alert (أ) — provider blocked", () => {
  it("fires CRITICAL on a quota_exceeded run in the last 60 minutes", () => {
    const snap = snapshot({
      aiRouter: {
        ok: true,
        data: makeAi({
          provider_blocked_60m: {
            count: 4,
            classes: ["quota_exceeded"],
            lastAt: new Date(),
          },
        }),
      },
    })
    const [alert] = deriveAiAlerts(snap, { includeCost: true })
    expect(alert.id).toBe("provider_blocked")
    expect(alert.severity).toBe("critical")
    // The count is folded into the sentence — rendered as «{value}{label}» it
    // used to print «4 رصيد المزوّد نفد …», a numeral glued to a clause it
    // does not quantify.
    expect(alert.value).toBe("")
    expect(alert.label).toBe("رصيد المزوّد نفد — 4 استدعاءات فاشلة آخر ساعة")
    expect(alert.label).toContain("رصيد")
  })

  it("names a rejected KEY differently from an empty balance", () => {
    const snap = snapshot({
      aiRouter: {
        ok: true,
        data: makeAi({
          provider_blocked_60m: {
            count: 1,
            classes: ["auth_failed"],
            lastAt: new Date(),
          },
        }),
      },
    })
    expect(deriveAiAlerts(snap, { includeCost: true })[0].label).toContain("مفتاح")
  })

  it("is ABSENT when nothing was blocked in the window", () => {
    expect(ids(snapshot())).not.toContain("provider_blocked")
  })

  it("repaints the whole band red — this is an outage, not an annoyance", () => {
    const snap = snapshot({
      aiRouter: {
        ok: true,
        data: makeAi({
          provider_blocked_60m: {
            count: 2,
            classes: ["quota_exceeded"],
            lastAt: new Date(),
          },
        }),
      },
    })
    const health = deriveSystemHealth(snap, {
      aiAlerts: deriveAiAlerts(snap, { includeCost: true }),
    })
    expect(health.hasCritical).toBe(true)
    expect(health.level).toBe("attention")
    // Critical alerts lead the chip row — an empty account outranks a
    // stuck job, and the operator reads top-down.
    expect(health.issues[0].severity).toBe("critical")
  })
})

// ─── (ب) Budget near the cap ─────────────────────────────────────────

describe("alert (ب) — budget near cap", () => {
  it(`fires at exactly ${BUDGET_ALERT_PCT}% of the binding tier cap`, () => {
    const snap = snapshot({
      aiRouter: { ok: true, data: aiAtCostPct(BUDGET_ALERT_PCT, "report") },
    })
    const alert = deriveAiAlerts(snap, { includeCost: true }).find(
      (a) => a.id === "budget_near_cap",
    )
    expect(alert).toBeDefined()
    expect(alert!.value).toBe("90%")
  })

  it("is ABSENT one point below the threshold", () => {
    const snap = snapshot({
      aiRouter: { ok: true, data: aiAtCostPct(BUDGET_ALERT_PCT - 1, "report") },
    })
    expect(ids(snap)).not.toContain("budget_near_cap")
  })

  it("is only CRITICAL when the cap actually enforces — a report-mode cap stops nothing", () => {
    const reporting = snapshot({
      aiRouter: { ok: true, data: aiAtCostPct(95, "report") },
    })
    const enforcing = snapshot({
      aiRouter: { ok: true, data: aiAtCostPct(95, "enforce") },
    })
    expect(
      deriveAiAlerts(reporting, { includeCost: true }).find(
        (a) => a.id === "budget_near_cap",
      )!.severity,
    ).toBe("warn")
    expect(
      deriveAiAlerts(enforcing, { includeCost: true }).find(
        (a) => a.id === "budget_near_cap",
      )!.severity,
    ).toBe("critical")
  })

  it("is omitted entirely for a viewer who may not see spend", () => {
    const snap = snapshot({
      aiRouter: { ok: true, data: aiAtCostPct(99, "enforce") },
    })
    expect(ids(snap, false)).not.toContain("budget_near_cap")
    expect(ids(snap, true)).toContain("budget_near_cap")
  })
})

// ─── (ج) Silent fallback to another model ────────────────────────────

describe("alert (ج) — running on a fallback model", () => {
  it("fires and names both models when a single task kind fell back", () => {
    const snap = snapshot({
      aiModels: {
        ok: true,
        data: makeModels({
          fallbacks: [
            {
              taskKind: "research",
              requestedModel: "gpt-5.6-terra",
              effectiveModel: "gpt-5.6-sol",
            },
          ],
        }),
      },
    })
    const alert = deriveAiAlerts(snap, { includeCost: true }).find(
      (a) => a.id === "model_fallback",
    )
    expect(alert).toBeDefined()
    expect(alert!.label).toContain("gpt-5.6-terra")
    expect(alert!.label).toContain("gpt-5.6-sol")
    // Quality degradation, not an outage — the calls still succeed.
    expect(alert!.severity).toBe("warn")
  })

  it("collapses to a count when several kinds fell back", () => {
    const snap = snapshot({
      aiModels: {
        ok: true,
        data: makeModels({
          fallbacks: [
            { taskKind: "research", requestedModel: "a", effectiveModel: "b" },
            { taskKind: "editorial", requestedModel: "c", effectiveModel: "d" },
          ],
        }),
      },
    })
    const alert = deriveAiAlerts(snap, { includeCost: true }).find(
      (a) => a.id === "model_fallback",
    )!
    expect(alert.value).toBe("")
    expect(alert.label).toBe("مهمتان تشتغل على موديل بديل بدل المطلوب")
  })

  it("is ABSENT when every task kind runs on its configured model", () => {
    expect(ids(snapshot())).not.toContain("model_fallback")
  })
})

// ─── (د) Model catalog unusable ──────────────────────────────────────

describe("alert (د) — availability check not running", () => {
  it("fires when the catalog has NEVER loaded (checks silently fail open)", () => {
    const snap = snapshot({
      aiModels: {
        ok: true,
        data: makeModels({
          catalog: {
            stale: true,
            lastError: "GET /v1/models → HTTP 401",
            refreshedAt: null,
            everLoaded: false,
          },
        }),
      },
    })
    expect(ids(snap)).toContain("catalog_unchecked")
  })

  it("fires when refresh keeps failing AND the cached copy has expired", () => {
    const snap = snapshot({
      aiModels: {
        ok: true,
        data: makeModels({
          catalog: {
            stale: true,
            lastError: "fetch failed",
            refreshedAt: "2026-07-01T00:00:00.000Z",
            everLoaded: true,
          },
        }),
      },
    })
    expect(ids(snap)).toContain("catalog_unchecked")
  })

  it("stays SILENT for normal stale-while-revalidate — stale but refreshing is not a fault", () => {
    const snap = snapshot({
      aiModels: {
        ok: true,
        data: makeModels({
          catalog: {
            stale: true,
            lastError: null,
            refreshedAt: "2026-07-01T00:00:00.000Z",
            everLoaded: true,
          },
        }),
      },
    })
    expect(ids(snap)).not.toContain("catalog_unchecked")
  })

  it("is ABSENT on a healthy catalog", () => {
    expect(ids(snapshot())).not.toContain("catalog_unchecked")
  })
})

// ─── (هـ) Model end-of-life ──────────────────────────────────────────

describe("alert (هـ) — model end of life", () => {
  it("warns for an upcoming retirement inside the window", () => {
    const snap = snapshot({
      aiModels: {
        ok: true,
        data: makeModels({
          eolRisks: [
            {
              provider: "gemini",
              modelName: "gemini-2.5-flash",
              retiresOn: "2026-10-16",
              daysLeft: 12,
              retired: false,
              reason: "selected",
            },
          ],
        }),
      },
    })
    const alert = deriveAiAlerts(snap, { includeCost: true }).find(
      (a) => a.id === "model_eol",
    )!
    expect(alert.severity).toBe("warn")
    expect(alert.value).toBe("12 يوم")
  })

  it("escalates to CRITICAL once the date has passed — the model is gone, calls fail now", () => {
    const snap = snapshot({
      aiModels: {
        ok: true,
        data: makeModels({
          eolRisks: [
            {
              provider: "gemini",
              modelName: "gemini-2.0-flash",
              retiresOn: "2026-06-01",
              daysLeft: -55,
              retired: true,
              reason: "used",
            },
          ],
        }),
      },
    })
    const alert = deriveAiAlerts(snap, { includeCost: true }).find(
      (a) => a.id === "model_eol",
    )!
    expect(alert.severity).toBe("critical")
    expect(alert.label).toContain("gemini-2.0-flash")
  })

  it("is ABSENT when nothing we depend on is retiring", () => {
    expect(ids(snapshot())).not.toContain("model_eol")
  })
})

// ─── The blind-spot alert ────────────────────────────────────────────

describe("unclassified failures", () => {
  it("fires when the router met failures it could not name", () => {
    const snap = snapshot({
      aiRouter: { ok: true, data: makeAi({ unclassified_failures_24h: 15 }) },
    })
    const alert = deriveAiAlerts(snap, { includeCost: true }).find(
      (a) => a.id === "unclassified_failures",
    )!
    expect(alert.value).toBe("")
    // 15 is 11+ → singular tamyiz. The old «15» + fixed «فشل غير مصنَّف» could
    // not inflect at all.
    expect(alert.label).toBe(
      "15 استدعاء فاشل بلا تصنيف (24 ساعة) — السبب غير معروف",
    )
    expect(alert.severity).toBe("warn")
  })

  it("is ABSENT when every failure was classified", () => {
    expect(ids(snapshot())).not.toContain("unclassified_failures")
  })
})

// ─── Grounded retrieval that never searched ──────────────────────────

/**
 * The one condition that hides inside a SUCCESS: `status = 'succeeded'`,
 * normal cost, no error class — and an answer written from the model's
 * memory. Threshold notes live on `RETRIEVAL_BLIND_ALERT_PCT`; these tests
 * pin both halves, and the absence half is the important one: grounding is
 * measurably flaky (≈1 blind draw in 6), and an alert that fired on that
 * would be furniture inside a week.
 */
describe("retrieval ran blind", () => {
  const withRetrieval = (runs: number, blind: number) =>
    snapshot({
      aiRouter: {
        ok: true,
        data: makeAi({ retrieval_24h: { runs, blind, lastBlindAt: new Date() } }),
      },
    })

  it("fires when half of the retrievals never searched", () => {
    const alert = deriveAiAlerts(withRetrieval(8, 4), { includeCost: true }).find(
      (a) => a.id === "retrieval_blind",
    )!
    expect(alert.severity).toBe("warn")
    expect(alert.value).toBe("50%")
    expect(alert.label).toContain("بلا بحث فعلي")
    // Counts agree in Arabic — «4 عمليات استرجاع», not «4 عملية استرجاع».
    expect(alert.label).toContain("4 عمليات استرجاع")
  })

  it("fires at 100% — retrieval is effectively off", () => {
    const alert = deriveAiAlerts(withRetrieval(5, 5), { includeCost: true }).find(
      (a) => a.id === "retrieval_blind",
    )!
    expect(alert.value).toBe("100%")
    // Still a warn: discovery/market/analysis keep running, they just run
    // blind. Red is reserved for "production is stopped".
    expect(alert.severity).toBe("warn")
  })

  it("is ABSENT just below the threshold", () => {
    expect(ids(withRetrieval(10, 4))).not.toContain("retrieval_blind")
  })

  it("is ABSENT for ordinary flakiness (1 blind in 6)", () => {
    expect(ids(withRetrieval(6, 1))).not.toContain("retrieval_blind")
  })

  it("is ABSENT below the minimum sample — 1-of-1 is not a trend", () => {
    expect(ids(withRetrieval(1, 1))).not.toContain("retrieval_blind")
    expect(ids(withRetrieval(2, 2))).not.toContain("retrieval_blind")
    expect(RETRIEVAL_BLIND_MIN_RUNS).toBe(3)
  })

  it("is ABSENT when no retrieval ran at all (no division by zero)", () => {
    expect(ids(withRetrieval(0, 0))).not.toContain("retrieval_blind")
  })

  it("is ABSENT when every retrieval actually searched", () => {
    expect(ids(snapshot())).not.toContain("retrieval_blind")
  })

  it("counts as a health issue on the band", () => {
    const snap = withRetrieval(4, 4)
    const alerts = deriveAiAlerts(snap, { includeCost: true })
    const health = deriveSystemHealth(snap, { aiAlerts: alerts })
    expect(health.issues.some((i) => i.label.includes("بلا بحث فعلي"))).toBe(true)
    expect(health.hasCritical).toBe(false)
  })
})

// ─── Unreadable sections must not manufacture alerts ─────────────────

describe("absence is never success — and never an alert either", () => {
  it("produces no AI alerts when the sections could not be read", () => {
    const snap = snapshot({
      aiRouter: { ok: false, error: "stub", errorRef: "0000" },
      aiModels: { ok: false, error: "stub", errorRef: "0000" },
    })
    expect(deriveAiAlerts(snap, { includeCost: true })).toEqual([])
  })

  it("…but the band still refuses to go green, because a section failed", () => {
    const snap = snapshot({
      aiRouter: { ok: false, error: "stub", errorRef: "0000" },
      aiModels: { ok: false, error: "stub", errorRef: "0000" },
    })
    const health = deriveSystemHealth(snap, {
      aiAlerts: deriveAiAlerts(snap, { includeCost: true }),
    })
    expect(health.level).toBe("unknown")
    expect(health.allSectionsOk).toBe(false)
  })
})

// ─── Source-level guards on the band's JSX ───────────────────────────
//
// The repo has no DOM test environment (vitest runs `environment: "node"`,
// and adding one is a new dependency, not part of this fix). Same precedent
// as tests/teaser-question-form.test.ts: the DECISIONS are asserted
// behaviourally above, and the handful of JSX facts with no runtime seam get
// narrow, named source guards here — so a regression fails in CI rather than
// in a visual review weeks later.

describe("SystemHealthBand wiring (source guards)", () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), "app/admin/ops/page.tsx"),
    "utf8",
  )

  it("passes the SAME alerts into the health derivation that it renders", () => {
    // Otherwise the band could paint a tone the chip list contradicts.
    expect(source).toContain("deriveAiAlerts(snap, { includeCost: canSeeCost })")
    expect(source).toContain("deriveSystemHealth(snap, { aiAlerts })")
  })

  it("gates the cost-derived alert on the same ADMIN flag as the cost tile", () => {
    expect(source).toContain("includeCost: canSeeCost")
    expect(source).toContain('const canSeeCost = hasRole(gate.user.role, "ADMIN")')
  })

  it("a critical alert repaints the band red, exactly like a dead worker", () => {
    expect(source).toContain("const stopped = workerDead || health.hasCritical")
    // The red branch is selected by `stopped`, not by `workerDead` alone.
    expect(source).toMatch(/const tone = stopped\s*\n?\s*\?/)
    expect(source).toContain("stopped || (known && !healthy) ? AlertTriangle")
  })

  it("renders a distinct red chip for critical issues even inside an amber band", () => {
    expect(source).toContain('it.severity === "critical"')
    // `-700`, not `-800`: the admin's documented coloured-text step.
    expect(source).toContain('"border-red-200 text-red-700"')
  })

  it("renders an empty-value alert as the label alone (no dangling blank span)", () => {
    expect(source).toContain('it.value === "" ? null : <span>{it.value}</span>')
  })

  it("has no numeric-value branch left — counts belong in the label", () => {
    // The `typeof it.value === "number"` branch printed «{value}{label}» over
    // a fixed singular noun, which is how «1 مهام متعثّرة» reached the band.
    expect(source).not.toContain('typeof it.value === "number"')
  })

  it("has a title branch for the AI-stopped state", () => {
    expect(source).toContain("health.hasCritical")
    expect(source).toContain("الذكاء الاصطناعي متوقف")
  })
})
