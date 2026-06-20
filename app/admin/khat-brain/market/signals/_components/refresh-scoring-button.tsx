"use client"

/**
 * Phase 5 — "تحديث تقييم الإشارات" button.
 *
 * Sits in the page header. Fires the same job pipeline the scheduler
 * uses for daily scoring. Operator-language only — no internal job
 * names are exposed.
 */

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Sparkles, RefreshCw } from "lucide-react"
import { refreshScoringAction } from "./refresh-scoring-action"

export function RefreshScoringButton() {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [note, setNote] = useState<string | null>(null)

  const onClick = () => {
    setNote(null)
    start(async () => {
      const r = await refreshScoringAction()
      setNote(r.message)
      if (r.ok) router.refresh()
    })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-xl border border-violet-500/30 bg-violet-500/10 px-3 py-1.5 text-[11.5px] font-medium text-violet-700 hover:bg-violet-500/20 disabled:cursor-not-allowed disabled:opacity-50"
        data-refresh-scoring
      >
        {pending ? (
          <RefreshCw className="h-3 w-3 animate-spin" />
        ) : (
          <Sparkles className="h-3 w-3" />
        )}
        {pending ? "جارٍ التحديث…" : "تحديث تقييم الإشارات"}
      </button>
      {note && (
        <span
          className="text-[10.5px] text-muted-foreground/80"
          data-refresh-scoring-note
        >
          {note}
        </span>
      )}
    </div>
  )
}
