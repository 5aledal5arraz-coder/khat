"use client"

/**
 * Phase X — "إنشاء ١٠ مواضيع جديدة" button.
 *
 * The generator runs in the worker (`original.generate_topics`): the click only
 * enqueues it and gets a jobId back. <JobStatusCard> then reports the real
 * state — queued, «عامل المهام لا يعمل», running, failed with its reason — and,
 * when it finishes, the full tally: how many were accepted, how many rejected,
 * and WHY each was rejected (in Arabic, never raw enums). `initialJob` is the
 * in-flight / just-finished run the page found server-side, so a reload
 * re-attaches to it instead of inviting a second paid run.
 *
 * Arabic content only — the English generation path was removed.
 */

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Sparkles, RefreshCw, Activity } from "lucide-react"
import { rejectionReasonLabel } from "@/lib/operator-language"
import { generateOriginalTopicsAction } from "../actions"
import { runAction } from "@/app/admin/components/run-action"
import { useJobStatus } from "@/app/admin/components/use-job-status"
import { JobStatusView, useJobRetry } from "@/app/admin/components/job-status-card"
import type { JobSnapshot } from "@/lib/jobs/status-view"
import type { OriginalTopicsJobResult } from "@/lib/jobs/original-jobs"

export function GenerateTopicsButton({
  initialJob = null,
}: {
  initialJob?: JobSnapshot | null
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  // Only a failure to ENQUEUE lands here (the call never came back, or the
  // queue refused) — there are no counts to report for it.
  const [failure, setFailure] = useState<string | null>(null)
  const [jobId, setJobId] = useState<string | null>(initialJob?.id ?? null)
  const [dismissed, setDismissed] = useState(false)
  const status = useJobStatus({
    jobId,
    initialJob,
    onSettled: (job) => {
      if (job.status === "succeeded") router.refresh()
    },
  })
  const jobRunning = jobId !== null && status.inFlight
  const jobRetry = useJobRetry((newId) => {
    setJobId(newId)
    setDismissed(false)
  })

  const onClick = () => {
    setFailure(null)
    start(async () => {
      const outcome = await runAction(() => generateOriginalTopicsAction("ar", 10))
      if (!outcome.ok) return setFailure(outcome.message)
      if (!outcome.data.ok || !outcome.data.jobId) return setFailure(outcome.data.message)
      setJobId(outcome.data.jobId)
      setDismissed(false)
    })
  }

  return (
    <div className="flex w-full max-w-xl flex-col items-start gap-2">
      <button
        type="button"
        onClick={onClick}
        disabled={pending || jobRunning}
        className="inline-flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-4 py-2 text-[12px] font-medium text-primary hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? (
          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
        ) : jobRunning ? (
          <Activity className="h-3.5 w-3.5 animate-pulse" />
        ) : (
          <Sparkles className="h-3.5 w-3.5" />
        )}
        {pending
          ? "جارٍ الجدولة…"
          : jobRunning
            ? "بانتظار اكتمال المهمة…"
            : "إنشاء ١٠ مواضيع جديدة"}
      </button>

      {failure && (
        <div className="w-full rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-[11.5px] font-medium leading-relaxed text-destructive">
          {failure}
        </div>
      )}

      {jobId && !dismissed && (
        <JobStatusView
          className="w-full"
          title="توليد المواضيع الأصيلة"
          jobId={jobId}
          {...status}
          onDismiss={() => setDismissed(true)}
          onRetry={status.job ? () => jobRetry.retry(status.job!.id) : undefined}
          retryPending={jobRetry.pending}
          retryError={jobRetry.error}
          renderResult={(job) => <RejectionReasons result={job.result as OriginalTopicsJobResult | null} />}
        />
      )}
    </div>
  )
}

function RejectionReasons({ result }: { result: OriginalTopicsJobResult | null }) {
  const reasons = result?.rejection_reasons ?? []
  if (!result?.ok || reasons.length === 0) return null
  return (
    <div className="mt-2 border-t border-border/40 pt-2 text-[11.5px] leading-relaxed">
      <div className="mb-1 text-[10.5px] font-medium text-muted-foreground">أسباب الرفض</div>
      <ul className="space-y-1.5">
        {reasons.map((rej, i) => (
          <li key={i} className="text-foreground/80">
            <span className="font-medium">«{rej.title || "بلا عنوان"}»</span>
            {": "}
            <span className="text-muted-foreground">
              {rej.reasons.map((r) => rejectionReasonLabel(r)).join("، ")}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
