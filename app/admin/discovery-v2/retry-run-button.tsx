"use client"

/**
 * «أعد المحاولة» on a failed discovery run — starts a new run with the same
 * inputs (retryV2DiscoveryAction) and opens it.
 */

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2, RotateCcw } from "lucide-react"
import { runAction } from "@/app/admin/components/run-action"
import { retryV2DiscoveryAction } from "./actions"

export function RetryRunButton({ runId }: { runId: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const onClick = () => {
    setError(null)
    start(async () => {
      const outcome = await runAction(() => retryV2DiscoveryAction(runId))
      if (!outcome.ok) return setError(outcome.message)
      const r = outcome.data
      if (r.success && r.runId) router.push(`/admin/discovery-v2/${r.runId}`)
      else setError(r.error ?? "تعذّر بدء التشغيل")
    })
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary px-3.5 py-1.5 text-[12px] font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
      >
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
        أعد المحاولة
      </button>
      {error && <p className="mt-2 text-[11.5px] text-rose-700">{error}</p>}
    </div>
  )
}
