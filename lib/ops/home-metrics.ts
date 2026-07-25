/**
 * `/admin/ops` home — the honest-numbers layer.
 *
 * Pure derivations over an `OpsSnapshot`. No I/O, no React, no JSX —
 * every headline number the admin home renders is computed HERE so it
 * can be unit-tested (`tests/ops/home-metrics.test.ts`). `page.tsx` is
 * display only.
 *
 * The governing rule: **absence is never success.** The dashboard used
 * to print a green "no AI errors in 24h" band while `ai_runs` had zero
 * rows for three weeks — a dead system read as a healthy one. Every
 * derivation below distinguishes "we measured, it's fine" from "we have
 * nothing to measure" from "we couldn't measure".
 */

import type { RateLimitMode } from "@/lib/db/schema/ai-rate-limit-events"
import { AI_RUN_STATUSES } from "@/lib/db/schema/ai-runs"
import { WORKER_HEALTHY_STATES, type WorkerHeartbeat } from "@/lib/ops/diagnostics"
import { humanizeAge } from "./format"
import type { AiRouterSnapshot, OpsSnapshot, QueueHealth } from "./snapshot"

/**
 * A pending job older than this is treated as a stalled queue, not as
 * normal latency. One hour: every recurring scheduler in `lib/jobs/`
 * runs far more often than that, so nothing legitimately due should sit
 * this long unless the worker isn't running.
 */
export const STALLED_PENDING_MS = 60 * 60 * 1000

/** ≥ this fraction of a tier's daily cap → amber. */
const COST_WARN_PCT = 75
/** ≥ this fraction → red (downgraded to amber unless the cap enforces). */
const COST_DANGER_PCT = 90

// ─── AI activity ─────────────────────────────────────────────────────

/**
 *   unavailable  — the aiRouter section failed; we know nothing.
 *   no_data      — zero AI calls in the window. NEUTRAL, not green.
 *   in_flight    — calls exist but NOTHING has finished yet. Not an error,
 *                  and not a success either: one call fired while the page
 *                  was loading used to render as "كلها نجحت" with zero
 *                  successes behind it.
 *   clean        — at least one call finished and none failed.
 *   has_failures — at least one failed / timed_out call.
 */
export type AiActivityState =
  | "unavailable"
  | "no_data"
  | "in_flight"
  | "clean"
  | "has_failures"

export interface AiActivity {
  /** Every `ai_runs` row in the window — all five statuses. */
  total24h: number
  succeeded: number
  /** failed + timed_out — both are money spent on nothing. */
  failed: number
  running: number
  state: AiActivityState
}

export function deriveAiActivity(ai: AiRouterSnapshot | null): AiActivity {
  if (!ai) {
    return { total24h: 0, succeeded: 0, failed: 0, running: 0, state: "unavailable" }
  }
  const c = ai.ai_runs_status_counts_24h
  const succeeded = c.succeeded ?? 0
  const failed = (c.failed ?? 0) + (c.timed_out ?? 0)
  const running = c.running ?? 0
  // Sum over the status enum, not over a hand-picked subset: the old
  // headline showed `succeeded` alone, so cancelled + running calls
  // vanished from a card labelled "AI calls".
  const total24h = AI_RUN_STATUSES.reduce((sum, s) => sum + (c[s] ?? 0), 0)

  const state: AiActivityState =
    total24h === 0
      ? "no_data"
      : failed > 0
        ? "has_failures"
        : succeeded === 0 && running > 0
          ? "in_flight"
          : "clean"

  return { total24h, succeeded, failed, running, state }
}

/**
 * The AI stat tile's sub-line. Every branch is bounded by what we actually
 * counted: "كلها نجحت" is only said when `succeeded` really is the whole
 * window, and a still-running call is never folded into a success claim.
 */
export function deriveAiHint(ai: AiActivity): string {
  switch (ai.state) {
    case "unavailable":
      // A missing hint left the tile's "—" unexplained; naming the
      // failure is the same honesty rule the rest of this file follows.
      return "تعذّر قراءة سجل الاستدعاءات"
    case "no_data":
      return "ما صار أي استدعاء خلال 24 ساعة"
    case "in_flight":
      return `${ai.running} استدعاء قيد التنفيذ — ما خلص شي بعد`
    case "has_failures":
      return `${ai.failed} فشل خلال 24 ساعة`
    case "clean":
      if (ai.running > 0) return `${ai.succeeded} نجحت · ${ai.running} قيد التنفيذ`
      // `cancelled` runs land here too — they neither failed nor succeeded,
      // so "كلها نجحت" is reserved for a window that is 100% successes.
      return ai.succeeded === ai.total24h ? "كلها نجحت" : `${ai.succeeded} نجحت بلا أخطاء`
  }
}

// ─── Worker ──────────────────────────────────────────────────────────

/**
 * The worker half of the health band's subtitle.
 *
 * The band used to hard-code «العامل نشط» inside its green branch. That was
 * only ever one of two healthy realities, and it left the operator no way to
 * see the difference between a worker chewing through a job and a worker
 * sitting on an empty queue — so a silent-but-fine system and a busy one read
 * identically, and the only state that DID look different was the false
 * «ميت». Each state now says exactly what it is.
 */
export function deriveWorkerSentence(worker: WorkerHeartbeat | null): string {
  if (worker === null) return "حالة العامل غير متاحة"
  switch (worker.state) {
    case "working":
      return worker.jobType ? `العامل شغّال — ${worker.jobType}` : "العامل شغّال"
    case "idle":
      // Named as a healthy state, not as an absence. "خامل" alone reads as a
      // fault to an operator scanning a status line.
      return "العامل شغّال بلا مهام — الطابور فاضي"
    case "down":
      return `العامل ما يرد — آخر نبض ${humanizeAge(worker.ageMs ?? 0)}`
    case "never":
      return "ما وصل أي نبض من العامل بعد"
    case "unreadable":
      return "تعذّر قراءة نبض العامل"
    case "db_down":
      return "قاعدة البيانات غير متاحة"
  }
}

/** The AI half of the health band's subtitle. Same honesty rules. */
export function deriveAiHealthSentence(ai: AiActivity): string {
  if (ai.state === "no_data") return "ما صار أي استدعاء ذكاء اصطناعي خلال 24 ساعة"
  if (ai.state === "in_flight") return `${ai.running} استدعاء ذكاء اصطناعي قيد التنفيذ`
  if (ai.running > 0)
    return `${ai.total24h} استدعاء ذكاء اصطناعي بلا أخطاء · ${ai.running} لسه شغّال`
  return `${ai.total24h} استدعاء ذكاء اصطناعي بلا أخطاء`
}

// ─── Cost ────────────────────────────────────────────────────────────

export type CostLevel = "ok" | "warn" | "danger"

export interface CostStatus {
  /** Today's unfiltered spend. `null` when the section is unavailable. */
  totalUsd: number | null
  /** light + expensive daily caps, summed — display context only. */
  capUsd: number | null
  /** Highest per-tier utilisation in percent, NOT total/totalCap. */
  pct: number | null
  level: CostLevel
  mode: RateLimitMode | null
  /** Today's runs with no `cost_usd` — makes `totalUsd` a lower bound. */
  unpricedCount: number
  /** Timezone the "today" boundary is measured in. */
  tz: string | null
}

export function deriveCostStatus(ai: AiRouterSnapshot | null): CostStatus {
  if (!ai) {
    return {
      totalUsd: null,
      capUsd: null,
      pct: null,
      level: "ok",
      mode: null,
      unpricedCount: 0,
      tz: null,
    }
  }

  const tiers = Object.values(ai.tiers)
  const capUsd = tiers.reduce((s, t) => s + (t.daily_cost_limit_usd ?? 0), 0)

  // The two caps are INDEPENDENT: light can be pinned at 5/5 (blocking,
  // in enforce mode) while expensive sits at 1/25, and a combined
  // ratio would report a reassuring 20%. The binding constraint is the
  // worst tier, so that's what we report. Tiers with a non-positive or
  // non-finite cap have no constraint to be a percentage of — skipped.
  const ratios = tiers
    .filter((t) => Number.isFinite(t.daily_cost_limit_usd) && t.daily_cost_limit_usd > 0)
    .map((t) => ((t.daily_cost_usd ?? 0) / t.daily_cost_limit_usd) * 100)
  const pct = ratios.length > 0 ? Math.round(Math.max(...ratios)) : null

  let level: CostLevel = "ok"
  if (pct !== null && pct >= COST_DANGER_PCT) level = "danger"
  else if (pct !== null && pct >= COST_WARN_PCT) level = "warn"

  // A cap that doesn't enforce cannot cause an outage, so it never
  // earns red. Screaming about a limit nothing checks trains the
  // operator to ignore the colour.
  if (level === "danger" && ai.rate_limit_mode !== "enforce") level = "warn"

  return {
    totalUsd: ai.daily_cost_usd_total,
    capUsd,
    pct,
    level,
    mode: ai.rate_limit_mode,
    unpricedCount: ai.unpriced_runs_today,
    tz: ai.day_boundary_tz,
  }
}

/**
 * The cost tile's cap line. Two things it must never do:
 *   • print a percentage when `pct` is null — `${pct ?? 0}%` turned "we have
 *     no usable cap to measure against" into a reassuring "0% من السقف".
 *   • print a cap figure that isn't a real, positive, finite number — the
 *     same `?? 0` fallback rendered an unknown cap as "$0.00".
 * Wording still follows the ACTUAL enforcement mode: a cap running in
 * `report` stops nothing, so it is never phrased as a limit.
 */
export function deriveCostCapLine(cost: CostStatus): string | null {
  const capText =
    cost.capUsd !== null && Number.isFinite(cost.capUsd) && cost.capUsd > 0
      ? `$${cost.capUsd.toFixed(2)}`
      : null

  switch (cost.mode) {
    case "enforce":
      if (cost.pct === null) return "نسبة السقف غير متاحة"
      return capText ? `${cost.pct}% من السقف (${capText})` : `${cost.pct}% من السقف`
    case "report":
      return capText
        ? `السقف ${capText} للمراقبة فقط — ما يوقف شي`
        : "بلا سقف صالح — للمراقبة فقط"
    case "off":
      return "بلا سقف مفعّل"
    default:
      return null
  }
}

// ─── Queue ───────────────────────────────────────────────────────────

export interface QueueStatus {
  /** pending AND due now. */
  dueNow: number | null
  /** pending but scheduled for the future — not a backlog. */
  scheduled: number | null
  running: number | null
  /** TRUE 24h dead count (not the capped display list length). */
  deadCount24h: number | null
  staleLeaseCount: number | null
  oldestPendingAgeMs: number | null
  /** Oldest due-or-overdue pending job has waited past the threshold. */
  stalled: boolean
}

export function deriveQueueStatus(queue: QueueHealth | null): QueueStatus {
  if (!queue) {
    return {
      dueNow: null,
      scheduled: null,
      running: null,
      deadCount24h: null,
      staleLeaseCount: null,
      oldestPendingAgeMs: null,
      stalled: false,
    }
  }
  const oldestPendingAgeMs = queue.oldestPending?.age_ms ?? null
  return {
    dueNow: queue.duePendingCount,
    scheduled: queue.scheduledPendingCount,
    running: queue.countsByStatus.running ?? 0,
    deadCount24h: queue.deadCount24h,
    staleLeaseCount: queue.staleLeaseCount,
    oldestPendingAgeMs,
    stalled: oldestPendingAgeMs !== null && oldestPendingAgeMs > STALLED_PENDING_MS,
  }
}

// ─── System health band ──────────────────────────────────────────────

export type SystemHealthLevel = "unknown" | "healthy" | "attention"

export interface SystemHealthIssue {
  label: string
  /** Number → rendered before the label; string → after it. */
  value: number | string
}

export interface SystemHealth {
  level: SystemHealthLevel
  issues: SystemHealthIssue[]
  /** All SEVEN snapshot sections resolved — not just queue + aiRouter. */
  allSectionsOk: boolean
  /**
   * Positive proof of life for the job worker: `true` = fresh heartbeat,
   * `false` = it stopped responding, `null` = we have no evidence either
   * way. `null` can never be green.
   */
  workerAlive: boolean | null
}

export function deriveSystemHealth(snap: OpsSnapshot): SystemHealth {
  // "كل الأنظمة تعمل بسلاسة" is a claim about the whole snapshot, so it
  // has to be checked against the whole snapshot. Checking two of six
  // sections let a failed guest-identity / EIR / events fetch render as
  // an all-green band.
  const allSectionsOk =
    snap.queue.ok &&
    snap.systemEvents.ok &&
    snap.aiRouter.ok &&
    snap.eirPipeline.ok &&
    snap.recentActivity.ok &&
    snap.guestIdentity.ok &&
    snap.worker.ok

  const queue = deriveQueueStatus(snap.queue.ok ? snap.queue.data : null)
  const aiActivity = deriveAiActivity(snap.aiRouter.ok ? snap.aiRouter.data : null)

  // Every section above only proves that a QUERY came back. A dead worker
  // enqueues nothing — no new jobs, no stalled ones, no AI runs — so the
  // whole snapshot goes quiet and quiet used to read as green. The worker
  // heartbeat is the only signal that distinguishes "idle" from "dead".
  //
  // `working` and `idle` are BOTH alive. The distinction that matters to this
  // function is liveness, not busyness: a worker polling an empty queue is a
  // healthy worker, and the previous mapping had no way to say so — it read
  // job activity, so ten quiet minutes produced `workerAlive === false` and a
  // red «الإنتاج متوقف» band on a system that was working fine.
  const worker = snap.worker.ok ? snap.worker.data : null
  const workerAlive =
    worker === null
      ? null
      : WORKER_HEALTHY_STATES.has(worker.state)
        ? true
        : worker.state === "down"
          ? false
          : // never / unreadable / db_down — nothing to measure.
            null

  const issues: SystemHealthIssue[] = []
  if (workerAlive === false)
    issues.push({
      label: "العامل (worker) ما يرد — آخر نبض",
      value: humanizeAge(worker?.ageMs ?? 0),
    })
  if (queue.deadCount24h !== null && queue.deadCount24h > 0)
    issues.push({ label: "مهام متعثّرة", value: queue.deadCount24h })
  if (queue.staleLeaseCount !== null && queue.staleLeaseCount > 0)
    issues.push({ label: "مهام بإيجار منتهٍ", value: queue.staleLeaseCount })
  // `no_data` is deliberately NOT an issue: nothing ran, which is
  // neither an error nor a success. It's reported as its own neutral
  // sentence in the band's subtitle.
  if (aiActivity.failed > 0)
    issues.push({ label: "فشل في الذكاء الاصطناعي", value: aiActivity.failed })
  if (queue.stalled && queue.oldestPendingAgeMs !== null)
    issues.push({
      label: "الطابور متوقّف — أقدم مهمة تنتظر",
      value: humanizeAge(queue.oldestPendingAgeMs),
    })

  // `workerAlive === null` blocks green the same way a failed section
  // does: "كل الأنظمة تعمل بسلاسة" is a claim about a LIVE system, and we
  // have no evidence it is one.
  const level: SystemHealthLevel =
    !allSectionsOk || workerAlive === null
      ? "unknown"
      : issues.length === 0
        ? "healthy"
        : "attention"

  return { level, issues, allSectionsOk, workerAlive }
}
