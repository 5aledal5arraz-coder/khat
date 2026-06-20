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
import { Loader2, CheckCircle2, XCircle } from "lucide-react"
import { toast } from "@/lib/use-toast"
import type { JobActionResult } from "./job-actions"

export function JobActionButton({
  label,
  pendingLabel,
  icon,
  successTitle,
  action,
  size = "sm",
}: {
  label: string
  pendingLabel: string
  icon: React.ReactNode
  /** Toast title fired on success. */
  successTitle: string
  /** Server action returning JobActionResult. */
  action: () => Promise<JobActionResult>
  size?: "sm" | "md"
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<JobActionResult | null>(null)

  const sizeClasses =
    size === "md"
      ? "px-3 py-1.5 text-[12px]"
      : "px-2.5 py-1 text-[11.5px]"

  const onClick = () => {
    setResult(null)
    startTransition(async () => {
      const r = await action()
      setResult(r)
      toast({
        title: r.ok ? successTitle : "فشلت العملية",
        description: r.message,
        variant: r.ok ? "success" : "error",
      })
      if (r.ok) router.refresh()
    })
  }

  return (
    <div className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className={`inline-flex items-center gap-1.5 rounded-lg border border-violet-500/40 bg-violet-500/10 font-medium text-violet-700 hover:bg-violet-500/20 disabled:opacity-50 ${sizeClasses}`}
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
        <div className="inline-flex items-center gap-1 rounded-md bg-rose-500/10 px-2 py-0.5 text-[10.5px] text-rose-700">
          <XCircle className="h-2.5 w-2.5" />
          {result.message}
        </div>
      )}
      {result && result.ok && (
        <div className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10.5px] text-emerald-700">
          <CheckCircle2 className="h-2.5 w-2.5" />
          {result.message}
        </div>
      )}
    </div>
  )
}
