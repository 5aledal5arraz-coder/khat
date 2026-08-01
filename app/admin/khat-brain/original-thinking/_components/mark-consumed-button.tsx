"use client"

/**
 * Phase X — "وضع علامة مُستهلك" button on a fresh topic card.
 *
 * Wires markConsumedAction (previously defined but unreachable from
 * the UI). Moving a topic to the "مستهلكة" section was a real gap:
 * the section existed with no way to send a topic there. On success
 * the row is re-fetched and drops out of the fresh list.
 */

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Check, RefreshCw } from "lucide-react"
import { markConsumedAction } from "../actions"
import { runAction } from "@/app/admin/components/run-action"

export function MarkConsumedButton({ id }: { id: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [failed, setFailed] = useState(false)

  const onClick = () => {
    setFailed(false)
    start(async () => {
      const outcome = await runAction(() => markConsumedAction(id))
      if (!outcome.ok) return setFailed(true)
      if (outcome.data.ok) router.refresh()
      else setFailed(true)
    })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border/50 bg-background/40 px-2.5 py-1 text-[10.5px] font-medium text-foreground/70 hover:bg-background/60 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? (
          <RefreshCw className="h-3 w-3 animate-spin" />
        ) : (
          <Check className="h-3 w-3" />
        )}
        وضع علامة مُستهلك
      </button>
      {failed && (
        <span className="text-[10px] text-destructive">تعذّر التحديث. حاول مجدّداً.</span>
      )}
    </div>
  )
}
