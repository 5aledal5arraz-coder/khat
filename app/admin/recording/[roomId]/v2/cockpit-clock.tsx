"use client"

/**
 * CompactClock + the on-air transport — the demoted, self-ticking time for the
 * status rail, and the two moves that act on the running take.
 *
 * CompactClock owns its OWN timer so it re-renders WITHOUT re-rendering the
 * rail or the question hero — the isolation that keeps the cockpit cheap. On
 * air the question is the centerpiece, not the clock.
 */

import { useEffect, useRef, useState } from "react"
import { Play, Pause, Square, RotateCcw, X } from "lucide-react"
import { clockParts, computeElapsedMs } from "./recording-shared"
import { cn } from "@/lib/utils"

type Status = "waiting" | "live" | "paused" | "ended"

export function CompactClock({
  status,
  elapsedMsAtBaseline,
  windowStartedAt,
}: {
  status: Status
  elapsedMsAtBaseline: number
  windowStartedAt: number | null
}) {
  // Force a re-render a few times a second while live; elapsed is DERIVED from
  // Date.now() during render so it never goes stale (same contract as
  // RecordingClock). Four ticks a second is plenty now that the display stops
  // at whole seconds — the old 60fps loop existed only to animate centiseconds.
  const [, setFrame] = useState(0)
  useEffect(() => {
    if (status !== "live" || windowStartedAt == null) return
    const id = window.setInterval(() => setFrame((f) => (f + 1) % 1_000_000), 250)
    return () => window.clearInterval(id)
  }, [status, windowStartedAt])

  const { hms } = clockParts(
    computeElapsedMs(elapsedMsAtBaseline, windowStartedAt, status === "live"),
  )
  /**
   * No centiseconds. They were a blur of motion in the host's periphery during
   * a take — the one place on the screen that never stopped moving — and
   * nobody calls a time to a hundredth of a second across a studio. Marker
   * timestamps keep their precision; this is only the glance clock.
   *
   * `suppressHydrationWarning`: elapsed is derived from `Date.now()` during
   * render, so the server's HTML and the client's first render legitimately
   * disagree. The suppression stays on the one node that carries the clock.
   */
  return (
    <span className="inline-flex items-baseline font-mono font-bold tabular-nums" dir="ltr">
      <span className="text-[20px] leading-none" suppressHydrationWarning>
        {hms}
      </span>
    </span>
  )
}

/**
 * Pause / resume — the reversible move. A labelled 44px target: it used to be
 * a 32×24 icon six pixels from «إنهاء».
 */
export function PauseResumeButton({
  status,
  busy,
  onPause,
  onResume,
}: {
  status: Status
  busy: boolean
  onPause: () => void
  onResume: () => void
}) {
  if (status === "live") {
    return (
      <button
        type="button"
        onClick={onPause}
        disabled={busy}
        aria-label="إيقاف مؤقت"
        className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-border/60 bg-background/60 px-3.5 text-[14px] font-medium text-foreground transition hover:bg-background disabled:opacity-50"
      >
        <Pause className="h-4 w-4" /> إيقاف
      </button>
    )
  }
  if (status === "paused") {
    return (
      <button
        type="button"
        onClick={onResume}
        disabled={busy}
        aria-label="استئناف"
        className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3.5 text-[14px] font-semibold text-emerald-700 transition hover:bg-emerald-500/20 disabled:opacity-50"
      >
        <Play className="h-4 w-4" /> استئناف
      </button>
    )
  }
  return null
}

/** How long «متأكد؟» waits for the second tap before quietly standing down. */
export const END_CONFIRM_WINDOW_MS = 4_000

/**
 * «إنهاء» — the irreversible move, as a TWO-STEP control.
 *
 * It sat 6px from Pause, the same size and shape, one tap, no confirmation —
 * while the far less final "reset" already asked first. A brushed thumb ended
 * the take. Now:
 *   • it lives at the far end of the rail, away from Pause;
 *   • it carries a text label, and is NEUTRAL at rest — danger colour appears
 *     only in the confirm state, so the rail no longer shows a red button all
 *     take long;
 *   • the first tap arms it («متأكد؟ إنهاء» + «لا»), the second ends; left
 *     alone it disarms after END_CONFIRM_WINDOW_MS.
 * There is deliberately no keyboard shortcut for it.
 */
export function EndTakeControl({
  busy,
  onEnd,
}: {
  busy: boolean
  onEnd: () => void
}) {
  const [armed, setArmed] = useState(false)
  const timer = useRef<number | null>(null)
  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current)
    },
    [],
  )
  const disarm = () => {
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = null
    setArmed(false)
  }
  if (!armed) {
    return (
      <button
        type="button"
        onClick={() => {
          setArmed(true)
          timer.current = window.setTimeout(() => setArmed(false), END_CONFIRM_WINDOW_MS)
        }}
        disabled={busy}
        aria-label="إنهاء التسجيل"
        className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-border/60 bg-background/60 px-3.5 text-[14px] font-medium text-muted-foreground transition hover:bg-background disabled:opacity-50"
      >
        <Square className="h-4 w-4" /> إنهاء
      </button>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5" role="group" aria-label="تأكيد إنهاء التسجيل">
      <button
        type="button"
        onClick={() => {
          disarm()
          onEnd()
        }}
        disabled={busy}
        className={cn(
          "inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-rose-700 px-3.5 text-[14px] font-semibold text-white transition hover:bg-rose-800 disabled:opacity-50",
        )}
      >
        <Square className="h-4 w-4" /> متأكد؟ إنهاء
      </button>
      <button
        type="button"
        onClick={disarm}
        aria-label="إلغاء الإنهاء"
        className="inline-flex h-11 min-w-[44px] items-center justify-center gap-1 rounded-xl border border-border/60 px-2.5 text-[14px] text-foreground"
      >
        <X className="h-4 w-4" /> لا
      </button>
    </span>
  )
}

/** Re-export the reset move for the wrap/preflight CTAs that need it inline. */
export function ResetButton({
  onClick,
  disabled,
}: {
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1.5 rounded-xl border border-border/50 px-3 py-1.5 text-[12px] font-medium text-muted-foreground transition hover:bg-background/70 disabled:opacity-50"
    >
      <span className="h-3.5 w-3.5"><RotateCcw /></span> إعادة ضبط
    </button>
  )
}
