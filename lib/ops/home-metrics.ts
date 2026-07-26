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
import { EPISODE_PHASES, type EpisodePhase } from "@/lib/db/schema/eir"
import { WORKER_HEALTHY_STATES, type WorkerHeartbeat } from "@/lib/ops/diagnostics"
import {
  PIPELINE_STAGES,
  type PipelineStageKey,
} from "@/lib/khat-brain/pipeline-stages"
import { formatArabicCount, ltrIsolate } from "@/lib/shared/formatters"
import { humanizeAge } from "./format"
import { OPS_SECTIONS } from "./snapshot"
import type { AiRouterSnapshot, OpsSnapshotPartial, QueueHealth } from "./snapshot"

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
 *
 * Every count goes through `formatArabicCount`. Interpolating a fixed singular
 * («2 استدعاء», «2 فشل») is wrong in Arabic for exactly the counts an ops
 * dashboard shows most: 1, 2 and 3–10.
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
      return `${formatArabicCount(ai.running, "استدعاء")} قيد التنفيذ — ما خلص شي بعد`
    case "has_failures":
      return `${formatArabicCount(ai.failed, "استدعاء فاشل")} خلال 24 ساعة`
    case "clean":
      if (ai.running > 0)
        return (
          `${formatArabicCount(ai.succeeded, "استدعاء ناجح")} · ` +
          `${formatArabicCount(ai.running, "استدعاء")} قيد التنفيذ`
        )
      // `cancelled` runs land here too — they neither failed nor succeeded,
      // so "كلها نجحت" is reserved for a window that is 100% successes.
      return ai.succeeded === ai.total24h
        ? "كلها نجحت"
        : `${formatArabicCount(ai.succeeded, "استدعاء ناجح")} بلا أخطاء`
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

/** The AI half of the health band's subtitle. Same honesty + plural rules. */
export function deriveAiHealthSentence(ai: AiActivity): string {
  if (ai.state === "no_data") return "ما صار أي استدعاء ذكاء اصطناعي خلال 24 ساعة"
  if (ai.state === "in_flight")
    return `${formatArabicCount(ai.running, "استدعاء ذكاء اصطناعي")} قيد التنفيذ`
  const total = `${formatArabicCount(ai.total24h, "استدعاء ذكاء اصطناعي")} بلا أخطاء`
  if (ai.running > 0)
    return `${total} · ${formatArabicCount(ai.running, "استدعاء")} لسه شغّال`
  return total
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
  // Isolated: «$30.00» sits inside an Arabic sentence, and `$` is a bidi
  // EUROPEAN TERMINATOR — its side of the number is decided by the
  // surrounding run, so the symbol drifts to the wrong end of its own figure
  // depending on what precedes it. An LRI pins the whole amount as one atomic
  // LTR run. (The standalone tile value needs no pin: it is its own element.)
  const capText =
    cost.capUsd !== null && Number.isFinite(cost.capUsd) && cost.capUsd > 0
      ? ltrIsolate(`$${cost.capUsd.toFixed(2)}`)
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

// ─── AI alerts (the silent-failure band) ─────────────────────────────

/**
 * Five conditions that were each individually invisible before this: the
 * system kept serving, the dashboard kept reading green, and the only
 * evidence was a console line nobody tails or a column nobody queried.
 *
 * Design rules, in order of importance:
 *   • **Exceptions-first.** An alert renders ONLY when its condition holds.
 *     There is no permanent banner, no "all clear" row — an operator who
 *     scrolls past the same box every morning has stopped reading it, and
 *     then misses the one that mattered.
 *   • **Urgency must match reality.** `critical` is reserved for "AI is
 *     stopped or about to stop". A retirement 82 days out is a WARN at
 *     most, and below the 30-day threshold it isn't shown at all.
 *   • **Absence is never success.** A section we couldn't read produces no
 *     alert — and `deriveSystemHealth` already refuses to paint the band
 *     green when any section failed, so silence here can't be mistaken for
 *     an all-clear.
 */
export type AiAlertSeverity = "critical" | "warn"

export type AiAlertId =
  | "provider_blocked"
  | "budget_near_cap"
  | "model_fallback"
  | "catalog_unchecked"
  | "model_eol"
  | "unclassified_failures"

export interface AiAlert {
  id: AiAlertId
  severity: AiAlertSeverity
  /**
   * The full Arabic sentence, counts already formatted through
   * `formatArabicCount`. See `AiAlert["value"]` for why it is not split.
   */
  label: string
  /**
   * A QUALITATIVE trailing value («منذ 21 يوم», «95%»), rendered after the
   * label. Empty string renders the label alone.
   *
   * Deliberately NOT `number | string`: the numeric channel rendered as
   * «{value}{label}» with a fixed singular noun behind it, which is how «1
   * مهام متعثّرة» and «15 مهام» reached the band. A count now goes through
   * `formatArabicCount` into `label`, and the type makes the old shortcut
   * unrepresentable rather than merely discouraged.
   */
  value: string
}

/** Daily-budget utilisation at or above this fraction of the cap alerts. */
export const BUDGET_ALERT_PCT = 90

export function deriveAiAlerts(
  snap: OpsSnapshotPartial,
  opts: {
    /**
     * Spend is ADMIN-only on this page (same rule as the cost tile). When
     * false the budget alert is omitted entirely rather than blanked — a
     * redacted alert is still a leak of the fact that we're near the cap.
     */
    includeCost: boolean
  },
): AiAlert[] {
  const alerts: AiAlert[] = []
  const ai = snap.aiRouter?.ok ? snap.aiRouter.data : null
  const models = snap.aiModels?.ok ? snap.aiModels.data : null

  // (أ) Provider refused us outright — no credit, or a rejected key. This is
  // "everything stopped": no retry anywhere in the system can recover it,
  // and it has bitten this project before. Highest priority, hence critical.
  if (ai && ai.provider_blocked_60m.count > 0) {
    const hasQuota = ai.provider_blocked_60m.classes.includes("quota_exceeded")
    const hasAuth = ai.provider_blocked_60m.classes.includes("auth_failed")
    // The count belongs INSIDE the sentence: rendered as «{value}{label}» it
    // read «3 رصيد المزوّد نفد — استدعاءات فاشلة آخر ساعة», a numeral glued to
    // the front of a clause it does not quantify.
    const failed = formatArabicCount(ai.provider_blocked_60m.count, "استدعاء فاشل")
    alerts.push({
      id: "provider_blocked",
      severity: "critical",
      label:
        hasQuota && hasAuth
          ? `رصيد المزوّد نفد والمفتاح مرفوض — ${failed} آخر ساعة`
          : hasQuota
            ? `رصيد المزوّد نفد — ${failed} آخر ساعة`
            : `مفتاح المزوّد مرفوض — ${failed} آخر ساعة`,
      value: "",
    })
  }

  // (ب) Daily budget near its cap. Critical ONLY when the cap actually
  // enforces — in `report` mode nothing stops, so it cannot cause an outage
  // and must not be dressed as one.
  if (opts.includeCost && ai) {
    const cost = deriveCostStatus(ai)
    if (cost.pct !== null && cost.pct >= BUDGET_ALERT_PCT) {
      alerts.push({
        id: "budget_near_cap",
        severity: cost.mode === "enforce" ? "critical" : "warn",
        label:
          cost.mode === "enforce"
            ? "الميزانية اليومية قاربت السقف — الاستدعاءات راح تتوقف"
            : "الميزانية اليومية قاربت السقف (للمراقبة فقط)",
        value: `${cost.pct}%`,
      })
    }
  }

  // (ج) Running on a model nobody chose. The call succeeds and the cost
  // looks normal, so nothing else on this page can reveal it — you could
  // work for weeks on a weaker model and never know.
  if (models && models.fallbacks.length > 0) {
    const first = models.fallbacks[0]
    alerts.push({
      id: "model_fallback",
      severity: "warn",
      label:
        models.fallbacks.length === 1
          ? // Task kind + both model ids are Latin identifiers dropped into an
            // Arabic run — isolated so the hyphens don't migrate.
            `${ltrIsolate(first.taskKind)}: يشتغل على ${ltrIsolate(first.effectiveModel)} بدل ${ltrIsolate(first.requestedModel)}`
          : // The count is INSIDE the label now: the chip renders «{value}{label}»,
            // which produced «15 مهام تشتغل…» — the one form Arabic never uses.
            `${formatArabicCount(models.fallbacks.length, "مهمة")} تشتغل على موديل بديل بدل المطلوب`,
      value: "",
    })
  }

  // (د) The availability check is fail-open by design, so when the catalog
  // never loads, model selection silently stops being verified at all and
  // NOTHING complains. A merely stale-but-cached catalog is normal
  // stale-while-revalidate and is deliberately not alerted — only a catalog
  // that has never loaded, or one whose refresh keeps failing while the
  // cached copy has expired.
  if (models) {
    if (!models.catalog.everLoaded) {
      alerts.push({
        id: "catalog_unchecked",
        severity: "warn",
        label: "فحص توفّر الموديلات معطّل — الكتالوج ما تحمّل ولا مرة",
        value: "",
      })
    } else if (models.catalog.lastError !== null && models.catalog.stale) {
      alerts.push({
        id: "catalog_unchecked",
        severity: "warn",
        label: "كتالوج الموديلات بايت وتعذّر تحديثه",
        value: "",
      })
    }
  }

  // (هـ) A model we depend on is retiring. Already-past dates are critical
  // (the model is GONE — calls fail now); an upcoming one inside the 30-day
  // window is a warn. `findEolRisks` has already filtered to models we
  // actually select or call, so this stays quiet by default.
  if (models && models.eolRisks.length > 0) {
    const worst = models.eolRisks[0]
    // The model id and the ISO retirement date are LTR runs inside an Arabic
    // sentence. Without an isolate, UAX#9 hands the neutral `-` and `()` to the
    // surrounding RTL run: «(2026-10-16)» painted as «(16-10-2026)» with the
    // brackets swapped — an operator cannot read the deadline off that.
    const name = ltrIsolate(worst.modelName)
    alerts.push({
      id: "model_eol",
      severity: worst.retired ? "critical" : "warn",
      label: worst.retired
        ? `${name} انتهى عمره الافتراضي (${ltrIsolate(worst.retiresOn)}) وما زال مستعملاً`
        : // `formatArabicCount(0, "يوم")` is «لا أيام» — correct as a count,
          // nonsense after «يتوقف بعد». Retiring today gets its own sentence.
          worst.daysLeft <= 0
          ? `${name} يتوقف اليوم`
          : `${name} يتوقف بعد`,
      value:
        worst.retired || worst.daysLeft <= 0
          ? ""
          : formatArabicCount(worst.daysLeft, "يوم"),
    })
  }

  // Not one of the five, but the reason the five can be trusted: a failure
  // the router could not name is invisible to every class-based condition
  // above. Showing the gap is the only honest alternative to guessing.
  if (ai && ai.unclassified_failures_24h > 0) {
    alerts.push({
      id: "unclassified_failures",
      severity: "warn",
      label:
        `${formatArabicCount(ai.unclassified_failures_24h, "استدعاء فاشل")} ` +
        `بلا تصنيف (24 ساعة) — السبب غير معروف`,
      value: "",
    })
  }

  return alerts
}

// ─── System health band ──────────────────────────────────────────────

export type SystemHealthLevel = "unknown" | "healthy" | "attention"

export interface SystemHealthIssue {
  /** Full Arabic sentence; any count already agrees (see `AiAlert.label`). */
  label: string
  /** Qualitative trailing value, rendered after the label. "" = label alone. */
  value: string
  /**
   * `critical` = AI is stopped or about to stop (provider refused us, an
   * enforcing cap about to bite, a model already retired). It repaints the
   * whole band red, so it is deliberately hard to earn. Defaults to `warn`.
   */
  severity?: AiAlertSeverity
}

export interface SystemHealth {
  level: SystemHealthLevel
  issues: SystemHealthIssue[]
  /** All EIGHT snapshot sections resolved — not just queue + aiRouter. */
  allSectionsOk: boolean
  /**
   * Positive proof of life for the job worker: `true` = fresh heartbeat,
   * `false` = it stopped responding, `null` = we have no evidence either
   * way. `null` can never be green.
   */
  workerAlive: boolean | null
  /**
   * At least one issue is `critical`. The band paints red on this the same
   * way it does for a dead worker — both mean production is stopped, and
   * amber for one and red for the other would teach the operator that the
   * amber ones are optional.
   */
  hasCritical: boolean
}

export function deriveSystemHealth(
  snap: OpsSnapshotPartial,
  opts: {
    /**
     * AI alerts from `deriveAiAlerts`. Passed in rather than derived here
     * because the caller decides whether the cost-sensitive one is included
     * (ADMIN-only), and health must reflect exactly what is rendered.
     */
    aiAlerts?: AiAlert[]
  } = {},
): SystemHealth {
  // "كل الأنظمة تعمل بسلاسة" is a claim about the whole snapshot, so it
  // has to be checked against the whole snapshot. Checking two of six
  // sections let a failed guest-identity / EIR / events fetch render as
  // an all-green band.
  //
  // "The whole snapshot" means every section the caller ACTUALLY REQUESTED
  // (`takeOpsSnapshot({ sections })`). A section that was never fetched is
  // `undefined` and is skipped: it contributes no evidence either way, and
  // counting it as a failure would paint every page that fetches a subset
  // permanently «تعذّر التأكد». The claim therefore narrows honestly with
  // the request — a page that reads five sections asserts about five.
  const allSectionsOk = OPS_SECTIONS.every((k) => snap[k] === undefined || snap[k].ok)

  const queue = deriveQueueStatus(snap.queue?.ok ? snap.queue.data : null)
  const aiActivity = deriveAiActivity(snap.aiRouter?.ok ? snap.aiRouter.data : null)

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
  const worker = snap.worker?.ok ? snap.worker.data : null
  const workerAlive =
    worker === null
      ? null
      : WORKER_HEALTHY_STATES.has(worker.state)
        ? true
        : worker.state === "down"
          ? false
          : // never / unreadable / db_down — nothing to measure.
            null

  // AI alerts bracket the operational issues: critical ones ABOVE (an
  // account with no credit outranks a single stuck job), warns below.
  const aiAlerts = opts.aiAlerts ?? []
  const toIssue = (a: AiAlert): SystemHealthIssue => ({
    label: a.label,
    value: a.value,
    severity: a.severity,
  })

  const issues: SystemHealthIssue[] = aiAlerts
    .filter((a) => a.severity === "critical")
    .map(toIssue)

  if (workerAlive === false)
    issues.push({
      label: "العامل (worker) ما يرد — آخر نبض",
      value: humanizeAge(worker?.ageMs ?? 0),
    })
  // The three COUNTED chips carry their number inside the label, via
  // `formatArabicCount`. The band renders «{value}{label}» for a numeric
  // value, which pinned the noun to one fixed form and printed «1 مهام
  // متعثّرة» and «15 مهام» — both wrong, and on the one band an operator
  // reads to decide whether to intervene. A pre-formatted label makes the
  // noun agree («مهمة متعثّرة واحدة» / «مهمتان متعثّرتان» / «3 مهام متعثّرة» /
  // «15 مهمة متعثّرة») and the empty `value` keeps the label-alone branch.
  if (queue.deadCount24h !== null && queue.deadCount24h > 0)
    issues.push({
      label: formatArabicCount(queue.deadCount24h, "مهمة متعثّرة"),
      value: "",
    })
  if (queue.staleLeaseCount !== null && queue.staleLeaseCount > 0)
    // «بإيجار منتهٍ» is an invariant prepositional phrase, so the plain noun
    // is enough — no adjective to agree, hence no phrase key for this one.
    issues.push({
      label: `${formatArabicCount(queue.staleLeaseCount, "مهمة")} بإيجار منتهٍ`,
      value: "",
    })
  // `no_data` is deliberately NOT an issue: nothing ran, which is
  // neither an error nor a success. It's reported as its own neutral
  // sentence in the band's subtitle.
  if (aiActivity.failed > 0)
    issues.push({
      label: `${formatArabicCount(aiActivity.failed, "استدعاء فاشل")} في الذكاء الاصطناعي`,
      value: "",
    })
  if (queue.stalled && queue.oldestPendingAgeMs !== null)
    issues.push({
      label: "الطابور متوقّف — أقدم مهمة تنتظر",
      value: humanizeAge(queue.oldestPendingAgeMs),
    })

  for (const a of aiAlerts) {
    if (a.severity !== "critical") issues.push(toIssue(a))
  }

  // `workerAlive === null` blocks green the same way a failed section
  // does: "كل الأنظمة تعمل بسلاسة" is a claim about a LIVE system, and we
  // have no evidence it is one.
  const level: SystemHealthLevel =
    !allSectionsOk || workerAlive === null
      ? "unknown"
      : issues.length === 0
        ? "healthy"
        : "attention"

  return {
    level,
    issues,
    allSectionsOk,
    workerAlive,
    hasCritical: issues.some((i) => i.severity === "critical"),
  }
}

// ─── Episode pipeline card ───────────────────────────────────────────

/** One phase cell in the pipeline card's distribution grid. */
export interface PipelineCell {
  phase: EpisodePhase
  label: string
  count: number
}

export interface PipelineSummary {
  /** The headline number. Sum of `cells` — see the note below. */
  inPipeline: number
  /** EIRs that have REACHED the `published` phase. Never mixed into the
   *  headline, and never the same figure as the «حلقات منشورة» KPI tile,
   *  which counts the public episode archive (episodes + YouTube). */
  publishedCount: number
  /**
   * Non-terminal phases, in `EPISODE_PHASES` order, zeros included. The home
   * rolls these up into five stages (`derivePipelineFunnel`); the per-phase
   * breakdown itself is rendered on `/admin/ops/details`.
   */
  cells: PipelineCell[]
}

/**
 * The pipeline card, derived in one place so its two numbers cannot drift.
 *
 * The bug this closes: the headline summed only NON-TERMINAL phases while the
 * grid under it rendered every phase except `archived` — i.e. it included
 * `published`. The grid therefore added up to `inPipeline + publishedCount`
 * and never matched the number printed directly above it, inside the same
 * card. Nothing was miscounted; the two views simply had different scopes.
 *
 * Reconciled by scope, not by relabelling: the card is «خط إنتاج الحلقات», so
 * both the headline and the grid are now exactly the work still IN the
 * pipeline. `published` is terminal — it leaves the pipeline — and is
 * reported once, beside the headline, explicitly named as a phase count.
 * `archived` was already excluded from both and stays excluded.
 *
 * INVARIANT (locked by tests/ops/home-metrics.test.ts):
 *   cells.reduce((s, c) => s + c.count, 0) === inPipeline
 */
export function derivePipelineSummary(
  eir: { countByPhase: Record<EpisodePhase, number> } | null,
  labels: Record<EpisodePhase, string>,
  terminalPhases: ReadonlySet<EpisodePhase>,
): PipelineSummary | null {
  if (!eir) return null
  const cells: PipelineCell[] = EPISODE_PHASES.filter(
    (p) => !terminalPhases.has(p),
  ).map((p) => ({ phase: p, label: labels[p], count: eir.countByPhase[p] ?? 0 }))
  return {
    inPipeline: cells.reduce((s, c) => s + c.count, 0),
    publishedCount: eir.countByPhase.published ?? 0,
    cells,
  }
}

// ─── Pipeline funnel (the five stages the home renders) ──────────────

/** One tile in the home's five-stage funnel. */
export interface PipelineStageGroup {
  key: PipelineStageKey
  label: string
  count: number
  /** Share of `inPipeline`, 0–100. A REAL proportion — see below. */
  sharePct: number
  /** Opens the episodes index already filtered to this stage's phases. */
  href: string
}

/**
 * Roll the 13 non-terminal phase cells up into the five operator-facing
 * stages of `lib/khat-brain/pipeline-stages.ts`.
 *
 * What this replaces, and why: the home used to draw one cell per phase, each
 * with a bar sized `count / peak`. That ratio is not a statistic — with one
 * record in every phase, all thirteen bars rendered 100% full — and the grid
 * wrapped to four rows at `lg`, so the pipeline ORDER, the only thing the view
 * exists to communicate, was lost. `sharePct` here is `count / inPipeline`:
 * an actual share of the pipeline, and the five bars sum to 100%.
 *
 * Nothing is lost by the rollup — the full 13-phase (in fact 15-phase)
 * breakdown is still rendered by `EirPipelineSection` on `/admin/ops/details`.
 *
 * INVARIANT (locked by tests/ops/pipeline-funnel.test.ts):
 *   groups.reduce((s, g) => s + g.count, 0) === summary.inPipeline
 * It holds because `PIPELINE_STAGES` is a COVERING, DISJOINT partition of the
 * non-terminal phases — coverage enforced by the type system in that module,
 * disjointness by the same test file.
 */
export function derivePipelineFunnel(summary: PipelineSummary): PipelineStageGroup[] {
  const byPhase = new Map(summary.cells.map((c) => [c.phase, c.count]))
  return PIPELINE_STAGES.map((stage) => {
    const count = stage.phases.reduce((s, p) => s + (byPhase.get(p) ?? 0), 0)
    return {
      key: stage.key,
      label: stage.label,
      count,
      // Guarded, not `?? 0`-ed after the fact: an empty pipeline divides by
      // zero and would paint every bar `NaN%`, which CSS silently drops.
      sharePct: summary.inPipeline > 0 ? (count / summary.inPipeline) * 100 : 0,
      href: `/admin/khat-brain/episodes?stage=${stage.key}`,
    }
  })
}
