/**
 * `prep.generate_v2` — run the five-pass Preparation V2 pipeline in the worker.
 *
 * Contract (see lib/jobs/prep-jobs.ts for why this left the request path):
 *   • A pipeline that RAN but did not produce a usable prep completes the job
 *     with `{ ok: false, messageAr }` — a result the card shows, NOT a retry.
 *     This includes the recording live-guard (`room_live`, commit 6b8dc71):
 *     a regeneration refused because a take is running must say so plainly.
 *   • A missing preparation is a data error → NonRetryableJobError (dead now).
 *   • A provider out of credit → rethrown so the worker's quota detection
 *     dead-letters it on attempt 1 with the billing message.
 *   • Any other throw fails the job (max_attempts 1 — the router already
 *     retries each AI call, so a whole-pipeline retry would only double-pay).
 *
 * Progress: each pass reports «المرحلة n/5: …» through ctx.reportProgress,
 * which also renews the lease on a long run.
 */

import { registerHandler } from "../registry"
import { NonRetryableJobError } from "../types"
import {
  PREP_GENERATE_V2_JOB,
  type PrepV2JobPayload,
  type PrepV2JobResult,
} from "../prep-jobs"
import { runPrepV2Pipeline, type RunPrepV2Result } from "@/lib/preparation/v2/pipeline"
import {
  describeValidationFailuresAr,
  PREP_V2_VALIDATION_LABELS_AR,
  prepV2SoftWarningAr,
  prepV2WarningAr,
  type ValidationFailure,
} from "@/lib/preparation/v2/validation"
import { ROOM_LIVE_REGENERATION_MESSAGE } from "@/lib/recording-v2/live-guard"
import { isQuotaExceededError } from "@/lib/ai-router/errors"

export const PREP_V2_DISABLED_MESSAGE =
  "توليد الإعداد العميق معطّل على الخادم (PREP_V2_ENABLED=false)."

/** Pure: pipeline outcome → the Arabic sentence the operator reads. Exported for tests. */
export function prepV2JobMessageAr(
  r: Pick<RunPrepV2Result, "ok" | "reason" | "validation">,
  trigger: PrepV2JobPayload["trigger"],
): string | null {
  if (r.ok) return null
  if (r.reason === "room_live") return ROOM_LIVE_REGENERATION_MESSAGE
  if (r.reason === "feature_disabled") return PREP_V2_DISABLED_MESSAGE
  // Conversion: the preparation row exists; say so first (prepV2WarningAr).
  if (trigger !== "regenerate") {
    return prepV2WarningAr({
      kind: "not_ok",
      reason: r.reason,
      failures: r.validation.failures,
    })
  }
  const why = describeValidationFailuresAr(r.validation.failures)
  return r.reason === "validation_failed_after_retry"
    ? why
      ? `فشل التحقق من بنية الإعداد بعد محاولتين: ${why}.`
      : "فشل التحقق من بنية الإعداد بعد محاولتين."
    : `تعذّر توليد الإعداد (${r.reason ?? "سبب غير معروف"}).`
}

function failureEvidence(failures: ValidationFailure[]): PrepV2JobResult["validation_failures"] {
  return failures.map((f) => ({
    code: f.code,
    label_ar: f.label_ar ?? PREP_V2_VALIDATION_LABELS_AR[f.code] ?? f.code,
    ...(f.detail ? { detail: f.detail } : {}),
  }))
}

export async function runPrepGenerateV2(
  payload: PrepV2JobPayload,
  reportProgress: (p: Record<string, unknown>) => Promise<void>,
): Promise<PrepV2JobResult> {
  if (!payload?.preparationId) {
    throw new NonRetryableJobError("مهمة توليد الإعداد بلا معرّف سجلّ إعداد.")
  }

  const r = await runPrepV2Pipeline({
    preparationId: payload.preparationId,
    language: payload.language === "en" ? "en" : "ar",
    force: payload.force === true,
    ...(payload.format ? { format: payload.format } : {}),
    ...(payload.targetMinutes != null ? { targetMinutes: payload.targetMinutes } : {}),
    onProgress: (p) => reportProgress({ ...p }),
  })

  if (r.reason === "preparation_not_found") {
    throw new NonRetryableJobError("سجلّ الإعداد غير موجود — ربما حُذف بعد جدولة المهمة.")
  }
  // A pass that failed because the provider is out of credit: surface it as
  // the terminal billing failure it is, not as "pass1_failed".
  if (!r.ok && r.error && isQuotaExceededError(r.error)) {
    throw new Error(r.error)
  }

  const counts = {
    sections: r.payload?.episode_sections?.length ?? 0,
    questions: r.payload?.question_bank?.length ?? 0,
  }
  const evidence = {
    ...(r.validation.failures.length > 0
      ? { validation_failures: failureEvidence(r.validation.failures) }
      : {}),
    ...(r.sanitized_guest_references
      ? { sanitized_guest_references: r.sanitized_guest_references }
      : {}),
  }
  if (r.ok) {
    return {
      ok: true,
      preparationId: payload.preparationId,
      ...counts,
      ai_run_ids: r.ai_run_ids as Record<string, unknown>,
      ...(r.soft_accepted ? { warningAr: prepV2SoftWarningAr(r.validation.failures) } : {}),
      ...evidence,
    }
  }
  return {
    ok: false,
    reason: r.reason,
    messageAr: prepV2JobMessageAr(r, payload.trigger) ?? undefined,
    retryable: r.reason !== "feature_disabled",
    preparationId: payload.preparationId,
    ...counts,
    ai_run_ids: r.ai_run_ids as Record<string, unknown>,
    ...evidence,
  }
}

registerHandler<PrepV2JobPayload, PrepV2JobResult>(
  PREP_GENERATE_V2_JOB,
  (payload, ctx) => runPrepGenerateV2(payload, ctx.reportProgress),
)
