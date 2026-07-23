"use client"

import {
  unstable_rethrow,
  unstable_isUnrecognizedActionError,
} from "next/navigation"

/**
 * Safe wrapper for invoking a Server Action from an admin client component.
 *
 * Why this exists: the admin calls Server Actions from inside
 * `startTransition(async () => { const r = await someAction(); setResult(r) })`
 * with no catch. That pattern only handles the happy path — every failure
 * that happens *before* the action returns a value (the gateway killing the
 * request, the tab being older than the running build, the network dropping)
 * escapes as a rejected transition. The operator gets no message explaining
 * what happened, so a long generation looks identical to a dead button.
 *
 * `runAction` converts all of that into a value: it never rejects, so the
 * transition always settles and `isPending` always clears, and it names the
 * failure in Arabic so the operator knows whether to reload, wait, or retry.
 *
 * The one deliberate exception is Next's own control-flow exceptions —
 * `redirect()`, `notFound()`, `forbidden()`, `unauthorized()`. Those are how
 * the framework navigates; swallowing them would silently break navigation,
 * so they are rethrown untouched via `unstable_rethrow`.
 */

/** Why a Server Action call failed before it could return a result. */
export type ActionFailureKind =
  /** This tab is older than the build now running — its action ids are gone. */
  | "stale_version"
  /** A proxy/gateway ended the request before the server replied (504/502). */
  | "gateway"
  /** The request never reached the server at all. */
  | "offline"
  /** The server refused because we asked too often. */
  | "rate_limited"
  /** Anything we cannot confidently classify. */
  | "unknown"

export type ActionOutcome<T> =
  | { ok: true; data: T }
  | { ok: false; kind: ActionFailureKind; message: string; cause: unknown }

/**
 * Operator-facing copy. Each message tells the operator what to DO, because
 * the whole point of this helper is that a failed click stops being silent.
 */
export const ACTION_FAILURE_MESSAGES: Record<ActionFailureKind, string> = {
  stale_version:
    "تم تحديث النسخة — أعد تحميل الصفحة ثم أعد المحاولة.",
  // Deliberately says the work MAY have continued: the gateway cut the
  // connection, not the job, and we do not want the operator firing off a
  // second expensive generation on top of one that is still running.
  gateway:
    "انقطع الاتصال بالخادم قبل أن ترجع النتيجة (تجاوز المهلة). قد تكون العملية ما زالت تعمل في الخلفية — حدّث الصفحة بعد قليل قبل إعادة المحاولة.",
  offline:
    "تعذّر الوصول إلى الخادم. تحقّق من الاتصال ثم أعد المحاولة.",
  rate_limited:
    "تم تجاوز الحد المسموح من الطلبات. انتظر قليلاً ثم أعد المحاولة.",
  unknown:
    "فشلت العملية لسبب غير متوقع. أعد المحاولة، وإذا تكرر الخطأ شارك التفاصيل مع الفريق التقني.",
}

/**
 * Next tags its own errors with a non-enumerable `__NEXT_ERROR_CODE`. It is a
 * far more stable discriminator than matching the English message text.
 */
function nextErrorCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null) return null
  const code = (error as { __NEXT_ERROR_CODE?: unknown }).__NEXT_ERROR_CODE
  return typeof code === "string" ? code : null
}

function errorText(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`
  return typeof error === "string" ? error : ""
}

/**
 * Classify a thrown Server Action failure.
 *
 * Every rule here is deliberately narrow. An unrecognised error stays
 * `"unknown"` rather than being forced into a specific bucket — a wrong,
 * confident message ("النسخة قديمة") would send the operator chasing the
 * wrong fix, which is worse than a generic one.
 */
export function classifyActionFailure(error: unknown): {
  kind: ActionFailureKind
  message: string
} {
  const kind = detectKind(error)
  return { kind, message: ACTION_FAILURE_MESSAGES[kind] }
}

function detectKind(error: unknown): ActionFailureKind {
  // Next 16 throws a typed error when the server did not recognise the action
  // id — i.e. this tab predates the running deployment.
  if (unstable_isUnrecognizedActionError(error)) return "stale_version"

  const text = errorText(error)

  // E394 = "a valid Server Action response was expected but something else
  // came back". In our deployment that means nginx returned its own 504/502
  // HTML page because `proxy_read_timeout` elapsed before the action replied.
  if (nextErrorCode(error) === "E394") return "gateway"

  // A failed `fetch` rejects with a TypeError. Require a network-shaped
  // message too, so a genuine TypeError bug in our own code is not
  // mislabelled as a connectivity problem.
  if (
    error instanceof TypeError &&
    /failed to fetch|networkerror|load failed|network request failed/i.test(text)
  ) {
    return "offline"
  }

  if (/\b429\b|too many requests|rate.?limit/i.test(text)) return "rate_limited"
  if (/\b(504|502)\b|gateway time-?out|bad gateway/i.test(text)) return "gateway"

  return "unknown"
}

/**
 * Run a Server Action and always come back with a value.
 *
 * ```ts
 * startTransition(async () => {
 *   const outcome = await runAction(() => generateHybridTopicsAction({ seasonId }))
 *   if (!outcome.ok) return setFailure(outcome.message)
 *   setResult(outcome.data)
 * })
 * ```
 */
export async function runAction<T>(
  fn: () => Promise<T>,
): Promise<ActionOutcome<T>> {
  try {
    return { ok: true, data: await fn() }
  } catch (error) {
    // redirect() / notFound() and friends must reach the framework untouched.
    unstable_rethrow(error)

    const { kind, message } = classifyActionFailure(error)
    console.error(`[admin] Server Action failed (${kind}):`, error)
    return { ok: false, kind, message, cause: error }
  }
}
