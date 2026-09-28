/**
 * Why a discovery v2 run failed, in the operator's words.
 *
 * The run page used to answer every empty run with «لم يصل أيّ مرشّح إلى
 * المعيار… جرّب موضوعاً أوسع أو خفّف الفلاتر» — including a run the propose
 * call never finished (prod 2026-09-28: two 180s timeouts in a row). That
 * advice is wrong for a timeout: the topic was fine, the call ran out of
 * time. The kind is decided once, where the failure happens (pipeline →
 * handler → `source_config.v2_error_kind`); runs persisted before the kind
 * existed are classified from the raw error text.
 */

export type V2RunErrorKind =
  /** The propose call hit the router timeout (after its retry). */
  | "propose_timeout"
  /** The propose call failed for any other reason (quota, 5xx, bad JSON…). */
  | "propose_failed"
  /** The propose call succeeded and returned no names at all. */
  | "no_names"
  /** Anything thrown later in the pipeline or while persisting. */
  | "error"

/** The router's own timeout message: "Provider timeout after 180000ms". */
const TIMEOUT_RE = /\btime(?:d[ _]?)?out\b/i

/** Classify a propose failure from the router's result. */
export function proposeErrorKind(status: string | null | undefined, error: string | null | undefined): V2RunErrorKind {
  if (status === "timed_out" || (error && TIMEOUT_RE.test(error))) return "propose_timeout"
  return "propose_failed"
}

/** The kind of a failed run: the persisted one, else read from the raw error (older runs). */
export function resolveV2RunErrorKind(
  kind: string | null | undefined,
  error: string | null | undefined,
): V2RunErrorKind {
  if (kind === "propose_timeout" || kind === "propose_failed" || kind === "no_names" || kind === "error") {
    return kind
  }
  if (error && TIMEOUT_RE.test(error)) return "propose_timeout"
  if (error === "no names proposed") return "no_names"
  return "error"
}

/** One Arabic line for the run page, the job row and the run's error_message. */
export function v2RunFailureMessage(kind: V2RunErrorKind): string {
  switch (kind) {
    case "propose_timeout":
      return "انتهت مهلة اقتراح الأسماء — أعد المحاولة."
    case "propose_failed":
      return "تعذّر اقتراح الأسماء بسبب خطأ في خدمة الذكاء الاصطناعي — أعد المحاولة."
    case "no_names":
      // The one genuine "nothing to show" failure: the topic/filters advice fits.
      return "لم يُقترح أيّ اسم لهذا الموضوع. جرّب موضوعاً أوسع أو خفّف الفلاتر."
    case "error":
      return "تعذّر إكمال الاكتشاف بسبب خطأ غير متوقّع — أعد المحاولة."
  }
}
