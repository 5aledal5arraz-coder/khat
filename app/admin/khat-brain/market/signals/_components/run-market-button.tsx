"use client"

/**
 * «تشغيل الآن» — the on-demand market run.
 *
 * The automatic daily refresh is off; this is how new market signals get
 * collected. Shows when the last successful run finished and whether one is
 * already waiting or running (then the button is disabled, so a second run
 * cannot be stacked). Operator-language only.
 */

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Clock, Play, RefreshCw } from "lucide-react"
import { runAction } from "@/app/admin/components/run-action"
import { formatArabicDateTime, formatRelativeTime } from "@/lib/shared/formatters"
import { cn } from "@/lib/utils"
import { runMarketNowAction } from "./run-market-action"

export function RunMarketButton({
  lastRunAt,
  inFlight,
}: {
  /** ISO time of the last successful run, null if none ever ran. */
  lastRunAt: string | null
  /** A run is pending or running right now. */
  inFlight: boolean
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [note, setNote] = useState<{ text: string; tone: "ok" | "error" } | null>(null)

  const busy = pending || inFlight

  const onClick = () => {
    setNote(null)
    start(async () => {
      const outcome = await runAction(() => runMarketNowAction())
      if (!outcome.ok) return setNote({ text: outcome.message, tone: "error" })
      const r = outcome.data
      setNote({ text: r.message, tone: r.ok ? "ok" : "error" })
      if (r.ok) router.refresh()
    })
  }

  return (
    <div className="flex flex-col items-end gap-1" data-run-market>
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-xl border border-primary/30 bg-primary/10 px-3 py-1.5 text-[11.5px] font-medium text-primary hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? (
          <RefreshCw className="h-3 w-3 animate-spin" />
        ) : (
          <Play className="h-3 w-3" />
        )}
        {pending ? "جارٍ الإضافة…" : inFlight ? "التشغيل جارٍ" : "تشغيل تحليل السوق الآن"}
      </button>
      <span className="inline-flex items-center gap-1 text-[10.5px] text-muted-foreground">
        <Clock className="h-2.5 w-2.5" />
        {inFlight
          ? "تشغيل بانتظار دوره أو قيد التنفيذ الآن."
          : lastRunAt
            ? `آخر تشغيل ناجح: ${formatRelativeTime(lastRunAt)} (${formatArabicDateTime(lastRunAt)})`
            : "لم يُشغَّل بعد."}
      </span>
      {note && (
        <span
          className={cn(
            "text-[10.5px]",
            note.tone === "error" ? "text-rose-700" : "text-emerald-700",
          )}
          role="status"
        >
          {note.text}
        </span>
      )}
    </div>
  )
}
