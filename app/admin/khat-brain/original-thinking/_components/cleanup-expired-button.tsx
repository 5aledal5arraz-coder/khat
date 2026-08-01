"use client"

/**
 * Phase X — "تنظيف المنتهية" button.
 *
 * Deletes unconsumed past-expiry topics (consumed history is kept).
 * Client-side so it can't double-submit and shows a result note,
 * matching the generate button's UX.
 */

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { RefreshCw, Trash2 } from "lucide-react"
import { expireOldAction } from "../actions"
import { runAction } from "@/app/admin/components/run-action"

export function CleanupExpiredButton() {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [note, setNote] = useState<string | null>(null)

  const onClick = () => {
    setNote(null)
    start(async () => {
      const outcome = await runAction(() => expireOldAction())
      if (!outcome.ok) return setNote(outcome.message)
      const r = outcome.data
      if (!r.ok && r.error) {
        setNote(r.error)
      } else {
        setNote(
          r.expired > 0
            ? `أُزيل ${r.expired} موضوعاً منتهياً.`
            : "لا توجد مواضيع منتهية لإزالتها.",
        )
      }
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-xl border border-border/50 bg-background/40 px-4 py-2 text-[12px] text-muted-foreground hover:bg-background/60 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? (
          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Trash2 className="h-3.5 w-3.5" />
        )}
        {pending ? "جارٍ التنظيف…" : "تنظيف المنتهية"}
      </button>
      {note && (
        <span className="text-[10.5px] text-muted-foreground/80">{note}</span>
      )}
    </div>
  )
}
