"use client"

/**
 * UX-11 — Manual "Rank now" button per stuck run.
 *
 * Operators can use this when a run completed search + verify but the
 * auto-advance helper didn't catch it (or to re-rank with a freshened
 * cross-run corpus).
 */

import { useState, useTransition } from "react"
import { ListChecks } from "lucide-react"
import { rankRunAction } from "./actions"

export function RankNowButton({ runId }: { runId: string }) {
  const [pending, start] = useTransition()
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <button
      type="button"
      onClick={() => {
        start(async () => {
          const r = await rankRunAction(runId)
          if (r.success) {
            setDone(true)
            setError(null)
          } else {
            setError(r.error)
          }
        })
      }}
      disabled={pending || done}
      title={error ?? undefined}
      className="inline-flex items-center gap-1 rounded-md border border-violet-500/40 bg-violet-500/10 px-2 py-0.5 text-[10.5px] text-violet-200 hover:bg-violet-500/20 disabled:opacity-40"
    >
      <ListChecks className="h-3 w-3" />
      {done ? "تم الإضافة للقائمة" : pending ? "..." : "ابدأ ترتيب"}
    </button>
  )
}
