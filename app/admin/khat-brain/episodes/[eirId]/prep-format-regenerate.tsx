"use client"

/**
 * «إعادة توليد الإعداد» with a FORMAT choice: قصة (the emotional arc) or
 * دورة مصغّرة / جلسة تدريبية (modules in the goal's order, method + tools).
 *
 * The choice is not stored on its own: a course run stamps
 * `prep_v2.format = "course"` on the payload it writes, so the selector opens
 * on whatever the current prep was generated as (`initialFormat`), and a
 * payload without the field is a story — exactly like every prep before this.
 *
 * Generation runs in the worker (`prep.generate_v2`): the click returns a job
 * id in milliseconds and the card below tracks it — «المرحلة 3/5: …», a clear
 * failure, or «عامل المهام لا يعمل». `initialJob` is the in-flight (or just
 * finished) job the server found for this prep, so a reload re-attaches to it
 * instead of offering a second paid run. The question editor stays locked for
 * as long as the JOB runs, not just the click.
 */

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { RefreshCw } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  autoOptionLabel,
  COURSE_TARGET_CHOICES,
  PREP_FORMATS,
  PREP_FORMAT_HINT_AR,
  PREP_FORMAT_LABEL_AR,
  type PrepFormat,
} from "@/lib/preparation/v2/format"
import { regeneratePrepV2Action, type JobActionResult } from "./job-actions"
import { JobActionButton, type JobActionConfirm } from "./job-action-button"
import { setPrepRegenerating } from "./prep-regen-signal"
import { useJobStatus } from "@/app/admin/components/use-job-status"
import { JobStatusView, useJobRetry } from "@/app/admin/components/job-status-card"
import type { JobSnapshot } from "@/lib/jobs/status-view"

export function PrepFormatRegenerate({
  eirId,
  initialFormat,
  autoTargetMinutes,
  size,
  confirm,
  initialJob = null,
}: {
  eirId: string
  /** The prep's in-flight / just-finished generation job, looked up server-side. */
  initialJob?: JobSnapshot | null
  initialFormat: PrepFormat
  /**
   * What «تلقائي» resolves to (server-computed from the goal +
   * expected_duration_min); null ⇒ the 120-minute default applies.
   */
  autoTargetMinutes: number | null
  size?: "sm" | "md"
  confirm?: JobActionConfirm
}) {
  const [format, setFormat] = useState<PrepFormat>(initialFormat)
  // Course length: "auto" reads it from the goal (after expected_duration_min).
  // Free-text parsing can't be airtight, so the operator can simply say it.
  const [targetMinutes, setTargetMinutes] = useState<"auto" | number>("auto")
  const router = useRouter()
  const [jobId, setJobId] = useState<string | null>(initialJob?.id ?? null)
  const [dismissed, setDismissed] = useState(false)
  const status = useJobStatus({
    jobId,
    initialJob,
    // The new prep is in the DB — pull it into the server-rendered tab.
    onSettled: () => router.refresh(),
  })
  const jobRunning = jobId !== null && status.inFlight

  // Locks the question editor while the click is in flight AND while the job
  // runs (prep-regen-signal.ts) — the job's write would overwrite any edit.
  const [clickPending, setClickPending] = useState(false)
  const onPendingChange = useCallback((p: boolean) => setClickPending(p), [])
  useEffect(() => {
    setPrepRegenerating(eirId, clickPending || jobRunning)
  }, [eirId, clickPending, jobRunning])
  useEffect(() => () => setPrepRegenerating(eirId, false), [eirId])

  // «أعد المحاولة» re-enqueues the SAME payload (format + length included).
  const jobRetry = useJobRetry((newId) => {
    setJobId(newId)
    setDismissed(false)
  })

  const onResult = useCallback((r: JobActionResult) => {
    if (r.ok && r.jobId) {
      setJobId(r.jobId)
      setDismissed(false)
    }
  }, [])

  return (
    <div className="flex flex-col gap-2" data-prep-format-regenerate>
      <div
        role="radiogroup"
        aria-label="صيغة الحلقة"
        className="inline-flex w-fit flex-wrap gap-1 rounded-xl border border-border/60 bg-card p-1"
      >
        {PREP_FORMATS.map((f) => {
          const active = f === format
          return (
            <button
              key={f}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setFormat(f)}
              className={cn(
                "min-h-[44px] rounded-lg px-3 py-1 text-[13px] transition-colors sm:min-h-0",
                active
                  ? "bg-primary/10 font-semibold text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {PREP_FORMAT_LABEL_AR[f]}
            </button>
          )
        })}
      </div>
      <p className="text-[12px] leading-relaxed text-muted-foreground">
        {PREP_FORMAT_HINT_AR[format]}
      </p>
      {format === "course" && (
        <label className="flex flex-wrap items-center gap-2 text-[13px] text-foreground">
          مدة الدورة
          <select
            value={String(targetMinutes)}
            onChange={(e) =>
              setTargetMinutes(e.target.value === "auto" ? "auto" : Number(e.target.value))
            }
            className="min-h-[44px] rounded-lg border border-border bg-card px-2 py-1 text-[13px] text-foreground sm:min-h-0"
          >
            <option value="auto">{autoOptionLabel(autoTargetMinutes)}</option>
            {COURSE_TARGET_CHOICES.map((m) => (
              <option key={m} value={m}>
                {m} دقيقة
              </option>
            ))}
          </select>
        </label>
      )}
      {jobId && !dismissed && (
        <JobStatusView
          title="توليد الإعداد العميق"
          jobId={jobId}
          {...status}
          onDismiss={() => setDismissed(true)}
          onRetry={status.job ? () => jobRetry.retry(status.job!.id) : undefined}
          retryPending={jobRetry.pending}
          retryError={jobRetry.error}
        />
      )}
      <div>
        <JobActionButton
          label={
            format === "course"
              ? "إعادة توليد الإعداد كدورة مصغّرة"
              : "إعادة توليد الإعداد"
          }
          pendingLabel="جارٍ الجدولة…"
          icon={<RefreshCw className="h-3 w-3" />}
          successTitle="بدأ توليد الإعداد"
          action={() =>
            regeneratePrepV2Action(
              eirId,
              format,
              format === "course" && targetMinutes !== "auto" ? targetMinutes : undefined,
            )
          }
          size={size}
          confirm={confirm}
          onPendingChange={onPendingChange}
          onResult={onResult}
          disabled={jobRunning}
          disabledReason="توليد الإعداد جارٍ بالفعل — انتظر اكتماله."
        />
      </div>
    </div>
  )
}
