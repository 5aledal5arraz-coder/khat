/**
 * Did the run's web search actually work? — the honesty layer (2026-09-29).
 *
 * Live runs 7fa3843c / d495c7cd: most grounded searches (harvest + story
 * checks) died on Gemini 503 «high demand», yet the run ended «اكتمل · 4
 * مقترح → 0 محقّق…» with nothing saying the web search had mostly failed —
 * only a per-card «لم يُفحص للقصة». Both the harvest and the story check are
 * deliberately fail-safe (fewer names / not_checked, never a failed run), so
 * the failure has to be COUNTED where it happens (pipeline → v2_stats) and
 * said once, at run level, on the run page and the EIR guest tab.
 *
 * Pure: no DB, no network — the pipeline, the run page and the EIR summary
 * all read the same functions.
 */

import { isRetriableProviderError } from "@/lib/ai-router/errors"

/** Why one grounded search failed. */
export type WebSearchFailureKind =
  /** Provider 503 overload / 429 / 5xx — still failing after the retries. */
  | "overloaded"
  /** The run's clock ran out (deadline / abort). */
  | "deadline"
  /** The daily retrieval budget is spent. */
  | "budget"
  /** Anything else (search never ran, misconfiguration, …). */
  | "other"

export function classifyWebSearchFailure(err: unknown): WebSearchFailureKind {
  const name = err instanceof Error ? err.name : ""
  const msg = err instanceof Error ? err.message : String(err)
  if (name === "RetrievalBudgetExceededError") return "budget"
  // An explicit provider overload wins over the clock: a 503 body can carry
  // words like "timeout" in its text, and it is the actionable reason.
  if (/\b503\b|UNAVAILABLE|high demand|overloaded/i.test(msg)) return "overloaded"
  if (
    name === "GroundedEvidenceDeadlineError" ||
    name === "AbortError" ||
    name === "TimeoutError" ||
    /\babort(ed)?\b|\btime(d[ _]?)?out\b|deadline/i.test(msg)
  ) {
    return "deadline"
  }
  if (isRetriableProviderError(err) || /high demand|overload|unavailable|\b5\d\d\b/i.test(msg)) {
    return "overloaded"
  }
  return "other"
}

/** The dominant reason among failures (overload wins a tie — it is the actionable one). */
export function dominantFailureKind(kinds: WebSearchFailureKind[]): WebSearchFailureKind | null {
  if (kinds.length === 0) return null
  const order: WebSearchFailureKind[] = ["overloaded", "budget", "deadline", "other"]
  let best: WebSearchFailureKind = order[0]
  let bestN = -1
  for (const k of order) {
    const n = kinds.filter((x) => x === k).length
    if (n > bestN) {
      best = k
      bestN = n
    }
  }
  return best
}

/** The v2_stats fields this module reads (all optional: older runs lack them). */
export interface WebSearchHealthStats {
  /** harvest searches that returned */
  harvest_queries?: number | string | boolean | null
  /** harvest searches that failed */
  harvest_failed?: number | string | boolean | null
  /** story-check searches that returned (a harvested name's reuse is not a search) */
  story_searched?: number | string | boolean | null
  /** story-check searches that failed (→ «لم يُفحص») */
  story_check_failed?: number | string | boolean | null
  /** any failure was a provider overload */
  provider_overloaded?: number | string | boolean | null
  /** dominant WebSearchFailureKind among the failures */
  web_failure_reason?: number | string | boolean | null
  /** names the propose model returned (0 = none / failed) */
  proposed_by_model?: number | string | boolean | null
  /** the propose call failed outright */
  propose_failed?: number | string | boolean | null
}

/**
 * From this share of failed searches up, the run's results are called
 * incomplete. One lost search in ten is noise the per-card label covers;
 * a third is a run that did not see the web.
 */
export const WEB_DEGRADED_SHARE = 0.3

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0)

export interface WebSearchWarning {
  /** One Arabic line, shown prominently. */
  headline: string
  /** The measurement behind it. */
  detail: string
}

/** A run-level warning when a meaningful share of the web search failed; null otherwise. */
export function webSearchWarning(stats: WebSearchHealthStats | null | undefined): WebSearchWarning | null {
  if (!stats) return null
  const failed = num(stats.harvest_failed) + num(stats.story_check_failed)
  const attempted = failed + num(stats.harvest_queries) + num(stats.story_searched)
  if (failed === 0 || attempted === 0 || failed / attempted < WEB_DEGRADED_SHARE) return null
  const reason =
    stats.provider_overloaded === true || stats.web_failure_reason === "overloaded"
      ? "overloaded"
      : stats.web_failure_reason
  const headline =
    reason === "overloaded"
      ? "⚠️ البحث في الويب تعطّل جزئياً (ضغط عند مزوّد البحث) — النتائج ناقصة، أعد التشغيل لاحقاً."
      : reason === "budget"
        ? "⚠️ البحث في الويب توقّف (نفدت ميزانية البحث اليومية) — النتائج ناقصة، أعد التشغيل غداً."
        : reason === "deadline"
          ? "⚠️ البحث في الويب لم يكتمل (انتهت مهلة التشغيل) — النتائج ناقصة، أعد التشغيل لاحقاً."
          : "⚠️ البحث في الويب تعطّل جزئياً (خطأ مؤقّت) — النتائج ناقصة، أعد التشغيل لاحقاً."
  return { headline, detail: `فشلت ${failed} من ${attempted} عملية بحث في الويب في هذا التشغيل.` }
}

/**
 * May a degraded (completed) run be re-run now? Not when the web search died
 * on the daily retrieval budget and that budget has not reset yet — the
 * banner already says «أعد التشغيل غداً», and a re-run today would hit the
 * same wall. The cap resets at UTC midnight (lib/ai-router/retrieval-budget.ts).
 */
export function canRetryDegradedRun(
  stats: WebSearchHealthStats | null | undefined,
  runCreatedAt: Date | string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!webSearchWarning(stats)) return false
  if (stats?.web_failure_reason !== "budget") return true
  if (!runCreatedAt) return false
  const created = new Date(runCreatedAt)
  const utcDay = (d: Date) => `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`
  return utcDay(created) !== utcDay(now)
}

/**
 * Said when the propose model contributed no names but the run still showed
 * some (they came from the web harvest / X). A run with no names at all is a
 * failed run and already says so (run-failure.ts).
 */
export function proposeWarning(stats: WebSearchHealthStats | null | undefined): string | null {
  if (!stats || stats.proposed_by_model == null) return null // older runs: unknown, say nothing
  if (stats.propose_failed === true) {
    return "⚠️ فشل اقتراح الأسماء بالذكاء الاصطناعي في هذا التشغيل — الأسماء المعروضة من البحث في الويب وX فقط."
  }
  if (num(stats.proposed_by_model) === 0) {
    return "⚠️ نموذج الاقتراح لم يُرجع أيّ اسم في هذا التشغيل — الأسماء المعروضة من البحث في الويب وX فقط."
  }
  return null
}

/**
 * Every run-level warning for a run in `status`, in display order (for
 * compact surfaces like the EIR guest tab). A running run has none yet; a
 * failed run already says why (run-failure.ts), so only the web warning is
 * added to it.
 */
export function runWarnings(
  stats: WebSearchHealthStats | null | undefined,
  status: string,
): string[] {
  if (status !== "completed" && status !== "failed") return []
  const out: string[] = []
  const web = webSearchWarning(stats)
  if (web) out.push(`${web.headline} ${web.detail}`)
  const p = status === "completed" ? proposeWarning(stats) : null
  if (p) out.push(p)
  return out
}
