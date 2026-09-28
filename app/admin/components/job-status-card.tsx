"use client"

/**
 * <JobStatusCard> — the one status surface for every background AI job
 * (prep generation, hybrid topics, season batches, Studio transcription, …).
 *
 * Never silent (lib/jobs/status-view.ts owns the wording):
 *   • queued, worker down   → amber «في الطابور — عامل المهام لا يعمل» (+ dev hint)
 *   • queued behind a job   → «في الانتظار خلف مهمة أخرى»
 *   • running               → «المرحلة 3/5: …» + bar + live elapsed time
 *   • finished with warning → amber, the warning verbatim
 *   • finished, not done    → amber, why (e.g. the recording room is live)
 *   • dead                  → red, error_message verbatim + «أعد المحاولة»
 * There is no inline fallback anywhere: if the worker is down the card says so.
 *
 * Admin is one forced-light surface: coloured text is the -700 step, no `dark:`.
 */

import { useEffect, useState, useTransition, type ReactNode } from "react"
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  RefreshCw,
  XCircle,
  X,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { formatTimeSeconds } from "@/lib/shared/formatters"
import { KIT_TONE_ICON } from "./ui-kit"
import { useJobStatus } from "./use-job-status"
import { runAction } from "./run-action"
import { retryJobAction } from "./job-retry-actions"
import {
  describeJob,
  type JobSnapshot,
  type JobViewTone,
  type WorkerSnapshot,
} from "@/lib/jobs/status-view"

const TONE_BOX: Record<JobViewTone, string> = {
  info: "border-primary/25 bg-primary/5",
  success: "border-emerald-500/30 bg-emerald-500/5",
  warning: "border-amber-500/40 bg-amber-500/5",
  danger: "border-destructive/40 bg-destructive/5",
}
const TONE_TEXT: Record<JobViewTone, string> = {
  info: "text-primary",
  success: "text-emerald-700",
  warning: "text-amber-700",
  danger: "text-destructive",
}
const TONE_ICON_KEY: Record<JobViewTone, keyof typeof KIT_TONE_ICON> = {
  info: "gold",
  success: "success",
  warning: "warning",
  danger: "danger",
}

export interface JobStatusCardProps {
  /** What this job is, e.g. «توليد الإعداد العميق». */
  title: string
  jobId?: string | null
  dedupeKey?: string | null
  initialJob?: JobSnapshot | null
  /** Fired once when the job reaches a terminal status. */
  onSettled?: (job: JobSnapshot) => void
  /**
   * Offered on dead / not-done / warning. JobStatusCard wires this itself
   * (re-enqueue with the same payload via retryJobAction) unless
   * `disableRetry`; JobStatusView shows the button only when it is given.
   */
  onRetry?: () => void
  retryPending?: boolean
  retryError?: string | null
  disableRetry?: boolean
  /** Told the new job id after a built-in retry re-enqueued the job. */
  onRetried?: (newJobId: string) => void
  /** Lets the operator hide a finished card. */
  onDismiss?: () => void
  /** Extra content under a successful result (e.g. counts). */
  renderResult?: (job: JobSnapshot) => ReactNode
  compact?: boolean
  className?: string
}

/** Self-polling card: give it a jobId (or dedupe key) and it tracks the job. */
export function JobStatusCard({
  jobId,
  dedupeKey,
  initialJob,
  onSettled,
  disableRetry,
  onRetried,
  ...view
}: JobStatusCardProps) {
  // After «أعد المحاولة» the card follows the NEW job.
  const [retriedId, setRetriedId] = useState<string | null>(null)
  const activeId = retriedId ?? jobId
  const status = useJobStatus({
    jobId: activeId,
    dedupeKey: activeId ? null : dedupeKey,
    initialJob: retriedId ? null : initialJob,
    onSettled,
  })
  const { retry, pending, error } = useJobRetry((newId) => {
    setRetriedId(newId)
    onRetried?.(newId)
  })
  const builtIn =
    !disableRetry && !view.onRetry && status.job ? () => retry(status.job!.id) : undefined
  return (
    <JobStatusView
      {...view}
      onRetry={view.onRetry ?? builtIn}
      retryPending={view.retryPending ?? pending}
      retryError={view.retryError ?? error}
      jobId={activeId}
      {...status}
    />
  )
}

/**
 * «أعد المحاولة» for a finished job: re-enqueue it with the same payload
 * (retryJobAction) and hand the new job id to `onRetried`.
 */
export function useJobRetry(onRetried: (newJobId: string) => void) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const retry = (jobId: string) =>
    start(async () => {
      setError(null)
      const outcome = await runAction(() => retryJobAction(jobId))
      if (!outcome.ok) return setError(outcome.message)
      if (!outcome.data.ok || !outcome.data.jobId) return setError(outcome.data.message)
      onRetried(outcome.data.jobId)
    })
  return { retry, pending, error }
}

export interface JobStatusViewProps
  extends Omit<
    JobStatusCardProps,
    "dedupeKey" | "initialJob" | "onSettled" | "disableRetry" | "onRetried"
  > {
  job: JobSnapshot | null
  worker: WorkerSnapshot | null
  pollError: string | null
}

/**
 * Presentational half — for a parent that polls with `useJobStatus` itself
 * because it also needs the job's state (e.g. to lock an editor while it runs).
 */
export function JobStatusView({
  title,
  jobId,
  job,
  worker,
  pollError,
  onRetry,
  retryPending,
  retryError,
  onDismiss,
  renderResult,
  compact,
  className,
}: JobStatusViewProps) {
  const now = useNow(job?.status === "running" || job?.status === "pending")

  if (!job) {
    if (!jobId) return null
    return (
      <div
        className={cn("rounded-xl border p-3 text-[12px]", TONE_BOX.info, className)}
        data-job-status="loading"
      >
        <span className="inline-flex items-center gap-1.5 text-primary">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> {title} — جارٍ جلب الحالة…
        </span>
      </div>
    )
  }

  const view = describeJob(job, worker, {
    nowMs: now,
    isDev: process.env.NODE_ENV !== "production",
  })
  const startedMs = Date.parse(job.started_at ?? job.created_at)
  const elapsedS = Math.max(0, Math.floor((now - startedMs) / 1000))
  const Icon =
    view.kind === "running"
      ? Loader2
      : view.kind === "succeeded"
        ? CheckCircle2
        : view.tone === "danger"
          ? XCircle
          : view.tone === "warning"
            ? AlertTriangle
            : Clock

  return (
    <div
      className={cn("rounded-xl border", compact ? "p-2" : "p-3", TONE_BOX[view.tone], className)}
      data-job-status={view.kind}
      data-job-id={job.id}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start gap-2.5">
        <span
          className={cn(
            "flex shrink-0 items-center justify-center rounded-lg",
            compact ? "h-6 w-6" : "h-8 w-8",
            KIT_TONE_ICON[TONE_ICON_KEY[view.tone]],
          )}
        >
          <Icon className={cn(compact ? "h-3.5 w-3.5" : "h-4 w-4", view.kind === "running" && "animate-spin")} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-[12px] font-semibold text-foreground">{title}</span>
            <span className={cn("text-[12px] font-medium", TONE_TEXT[view.tone])}>
              {view.title}
            </span>
            {!view.terminal && (
              <span className="text-[11px] tabular-nums text-muted-foreground" dir="ltr" suppressHydrationWarning>
                {formatTimeSeconds(elapsedS)}
              </span>
            )}
          </div>

          {view.progressLabel && (
            <div className="mt-1 text-[11.5px] text-foreground/85">{view.progressLabel}</div>
          )}
          {view.fraction !== null && !view.terminal && (
            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-500"
                style={{ width: `${Math.round(view.fraction * 100)}%` }}
              />
            </div>
          )}
          {view.detail && (
            <p className="mt-1 whitespace-pre-line text-[11.5px] leading-relaxed text-foreground/85">
              {view.detail}
            </p>
          )}
          {view.devHint && (
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground" data-job-dev-hint>
              للتطوير المحلي: شغّل{" "}
              {devCommands(view.devHint).map((cmd, i) => (
                <span key={cmd}>
                  {i > 0 && " أو "}
                  <code dir="ltr" className="rounded-sm bg-muted px-1">{cmd}</code>
                </span>
              ))}
            </p>
          )}
          {pollError && (
            <p className="mt-1 text-[11px] text-amber-700">{pollError}</p>
          )}
          {retryError && (
            <p className="mt-1 text-[11px] text-destructive">{retryError}</p>
          )}
          {view.kind === "succeeded" || view.kind === "succeeded_warning"
            ? renderResult?.(job)
            : null}

          {(view.canRetry && onRetry) || (view.terminal && onDismiss) ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {view.canRetry && onRetry && (
                <button
                  type="button"
                  onClick={onRetry}
                  disabled={retryPending}
                  className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1 text-[12px] font-medium text-foreground hover:bg-muted disabled:opacity-50 sm:min-h-0"
                  data-job-retry
                >
                  {retryPending ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3 w-3" />
                  )}
                  أعد المحاولة
                </button>
              )}
              {view.terminal && onDismiss && (
                <button
                  type="button"
                  onClick={onDismiss}
                  className="inline-flex min-h-[36px] items-center gap-1 rounded-lg px-2 py-1 text-[11.5px] text-muted-foreground hover:text-foreground sm:min-h-0"
                >
                  <X className="h-3 w-3" /> إخفاء
                </button>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

/** The shell commands inside the dev hint, each rendered as its own LTR chip. */
function devCommands(hint: string): string[] {
  return hint.match(/npm run [\w:]+/g) ?? [hint]
}

/** Wall-clock "now", ticking every second only while `active`. */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [active])
  return now
}
