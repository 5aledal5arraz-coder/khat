"use client"

import { useEffect, useState } from "react"
import { Undo2, Loader2 } from "lucide-react"

/**
 * 10-second undo affordance. Mounts with a decision id; tracks remaining
 * ms via a rAF-driven countdown. When the user clicks undo, fires the
 * provided handler. After the window lapses, the toast auto-dismisses.
 */
export function UndoToast({
  decisionId,
  label,
  createdAt,
  windowMs = 10_000,
  pending,
  onUndo,
  onDismiss,
}: {
  decisionId: string
  label: string
  createdAt: number
  windowMs?: number
  pending: boolean
  onUndo: () => void
  onDismiss: () => void
}) {
  const [remaining, setRemaining] = useState<number>(() =>
    Math.max(0, windowMs - (Date.now() - createdAt)),
  )

  useEffect(() => {
    const tick = () => {
      const left = Math.max(0, windowMs - (Date.now() - createdAt))
      setRemaining(left)
      if (left <= 0) {
        onDismiss()
        return
      }
      raf = requestAnimationFrame(tick)
    }
    let raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // We only want to start one countdown per mount / decisionId change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decisionId])

  const seconds = Math.ceil(remaining / 1000)
  const progress = remaining / windowMs

  return (
    <div className="pointer-events-auto fixed inset-x-0 bottom-4 z-40 mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-border/60 bg-card/95 px-4 py-3 shadow-2xl backdrop-blur-md">
      <div className="text-[13px] font-medium">{label}</div>
      <div className="flex-1" />
      <button
        type="button"
        onClick={onUndo}
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-background/60 px-3 py-1.5 text-[12px] font-semibold transition-colors hover:border-primary/40 hover:text-primary disabled:opacity-50"
      >
        {pending ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <Undo2 className="h-3 w-3" />
        )}
        تراجع
        <span className="tabular-nums text-muted-foreground">· {seconds}s</span>
      </button>
      {/* Countdown progress bar */}
      <div className="absolute inset-x-0 bottom-0 h-[2px] overflow-hidden rounded-b-2xl bg-border/20">
        <div
          className="h-full bg-primary/60 transition-[width] duration-100"
          style={{ width: `${Math.max(0, progress * 100)}%` }}
        />
      </div>
    </div>
  )
}
