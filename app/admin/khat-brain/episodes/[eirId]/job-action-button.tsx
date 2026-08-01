"use client"

/**
 * UX-5.4 — Lightweight button that triggers a workspace job action,
 * shows a loading spinner while pending, then renders an inline
 * success/failure pill. Also fires a toast so the operator gets
 * confirmation even if they've scrolled past the button.
 *
 * Used by Preparation / Performance tabs to wrap the regenerate /
 * recompute / refresh actions.
 */

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2, CheckCircle2, XCircle, AlertTriangle } from "lucide-react"
import { toast } from "@/lib/use-toast"
import { runAction } from "@/app/admin/components/run-action"
import type { JobActionResult } from "./job-actions"

/** Copy for the confirmation panel of a destructive action. */
export interface JobActionConfirm {
  /** Panel heading, e.g. "تأكيد إعادة توليد الإعداد". */
  title: string
  /** What will be LOST. Must be literally true — state consequences, not risk. */
  body: React.ReactNode
  /** Confirm-button label, e.g. "إعادة التوليد وحذف التعديلات". */
  confirmLabel: string
}

export function JobActionButton({
  label,
  pendingLabel,
  icon,
  successTitle,
  action,
  size = "sm",
  confirm,
}: {
  label: string
  pendingLabel: string
  icon: React.ReactNode
  /** Toast title fired on success. */
  successTitle: string
  /** Server action returning JobActionResult. */
  action: () => Promise<JobActionResult>
  size?: "sm" | "md"
  /**
   * When set, the first click opens an inline confirmation panel instead of
   * firing, and the trigger renders in a warning tone. Pass this for any
   * action that destroys work the operator can't get back — without it a
   * destructive trigger is pixel-identical to "فتح غرفة التسجيل".
   * Panel shape copied from `push-button.tsx`, the existing precedent.
   */
  confirm?: JobActionConfirm
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<JobActionResult | null>(null)
  const [confirming, setConfirming] = useState(false)

  // «إعادة توليد الإعداد» measured 27.3px tall at 375px. `min-h-[44px]` is the
  // preflight screens' touch size; it is dropped from `sm:` up so desktop rows
  // keep their density.
  const sizeClasses =
    size === "md"
      ? "min-h-[44px] px-3 py-1.5 text-[13px] sm:min-h-0"
      : "min-h-[44px] px-2.5 py-1 text-[13px] sm:min-h-0"

  // Destructive actions read amber, not the same violet as every safe action
  // beside them. Colour alone is never the whole signal — the confirmation
  // panel is — but identical styling is what made the danger invisible.
  const toneClasses = confirm
    ? "border-amber-500/50 bg-amber-500/10 text-amber-800 hover:bg-amber-500/20"
    : "border-violet-500/40 bg-violet-500/10 text-violet-700 hover:bg-violet-500/20"

  const run = () => {
    setResult(null)
    // The panel is NOT closed here. Closing before `startTransition` unmounted
    // it in the same render, which made its own spinner and its own failure
    // pill unreachable code — the operator confirmed a destructive action and
    // the panel just vanished. It now stays up for the duration and closes
    // only on success, which is what `push-button.tsx` (the precedent this
    // panel was copied from) does.
    startTransition(async () => {
      // Regeneration is the longest action in the admin and the likeliest to
      // be cut off by nginx at 120s. Un-wrapped, that rejection escapes the
      // transition, `pending` never clears, and the button stays a spinner
      // forever. runAction turns it into an ordinary failed result.
      const outcome = await runAction(action)
      const r: JobActionResult = outcome.ok
        ? outcome.data
        : { ok: false, message: outcome.message }
      setResult(r)
      toast({
        title: r.ok ? successTitle : "فشلت العملية",
        description: r.message,
        variant: r.ok ? "success" : "error",
      })
      // On failure the panel stays open, carrying the reason, so the operator
      // can retry or cancel without re-arming the confirmation.
      if (r.ok) {
        setConfirming(false)
        router.refresh()
      }
    })
  }

  const onClick = () => {
    if (confirm && !confirming) {
      setResult(null)
      setConfirming(true)
      return
    }
    run()
  }

  if (confirm && confirming) {
    return (
      <div
        className="w-full rounded-2xl border border-amber-500/40 bg-amber-500/5 p-3 text-[12px]"
        data-job-action-confirm-panel
      >
        <div className="mb-2 inline-flex items-center gap-1.5 text-[11px] font-semibold text-amber-800">
          <AlertTriangle className="h-3 w-3" /> {confirm.title}
        </div>
        <div className="mb-3 leading-relaxed text-foreground/85">
          {confirm.body}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={run}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-xl border border-amber-500/50 bg-amber-500/15 px-3 py-1.5 text-[12px] font-medium text-amber-800 hover:bg-amber-500/25 disabled:opacity-50"
            data-job-action-confirm-button
          >
            {pending ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" />
                {pendingLabel}
              </>
            ) : (
              <>
                {icon}
                {confirm.confirmLabel}
              </>
            )}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border/50 bg-background/40 px-3 py-1.5 text-[12px] text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            إلغاء
          </button>
        </div>
        {result && !result.ok && (
          <div className="mt-2 flex max-w-sm items-start gap-1.5 rounded-md bg-rose-500/10 px-2 py-1 text-[13px] leading-relaxed text-rose-800">
            <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {result.message}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className={`inline-flex items-center gap-1.5 rounded-lg border font-medium disabled:opacity-50 ${toneClasses} ${sizeClasses}`}
        data-job-action-button
      >
        {pending ? (
          <>
            <Loader2 className="h-3 w-3 animate-spin" />
            {pendingLabel}
          </>
        ) : (
          <>
            {icon}
            {label}
          </>
        )}
      </button>
      {result && !result.ok && (
        <div className="flex max-w-sm items-start gap-1.5 rounded-md bg-rose-500/10 px-2 py-1 text-[13px] leading-relaxed text-rose-800">
          <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {result.message}
        </div>
      )}
      {result && result.ok && (
        <div className="flex max-w-sm items-start gap-1.5 rounded-md bg-emerald-500/10 px-2 py-1 text-[13px] leading-relaxed text-emerald-800">
          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {result.message}
        </div>
      )}
    </div>
  )
}
