"use client"

/**
 * CompactClock + Transport — the demoted, self-ticking time for the on-air
 * status rail.
 *
 * CompactClock owns its OWN requestAnimationFrame loop (the exact pattern from
 * RecordingClock) so it re-renders ~60fps WITHOUT re-rendering the rail or the
 * question hero — the rAF isolation that keeps the cockpit cheap. The big hero
 * timer (RecordingClock) is no longer the centerpiece; on air the question is.
 */

import { useEffect, useState } from "react"
import { Play, Pause, Square, RotateCcw } from "lucide-react"
import { clockParts, computeElapsedMs } from "./recording-shared"

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
  // Force a re-render each frame while live; elapsed is DERIVED from Date.now()
  // during render so it never goes stale (same contract as RecordingClock).
  const [, setFrame] = useState(0)
  useEffect(() => {
    if (status !== "live" || windowStartedAt == null) return
    let raf = 0
    const loop = () => {
      setFrame((f) => (f + 1) % 1_000_000)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [status, windowStartedAt])

  const { hms, cs } = clockParts(
    computeElapsedMs(elapsedMsAtBaseline, windowStartedAt, status === "live"),
  )
  return (
    <span className="inline-flex items-baseline font-mono font-bold tabular-nums" dir="ltr">
      <span className="text-[20px] leading-none">{hms}</span>
      <span className="ms-0.5 text-[12px] text-muted-foreground/70">.{cs}</span>
    </span>
  )
}

/** Compact transport for the rail — only the moves relevant to the live take. */
export function Transport({
  status,
  busy,
  onPause,
  onResume,
  onEnd,
}: {
  status: Status
  busy: boolean
  onPause: () => void
  onResume: () => void
  onEnd: () => void
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {status === "live" && (
        <TransportBtn onClick={onPause} disabled={busy} label="إيقاف مؤقت" icon={<Pause />} />
      )}
      {status === "paused" && (
        <TransportBtn onClick={onResume} disabled={busy} label="استئناف" icon={<Play />} tone="go" />
      )}
      {(status === "live" || status === "paused") && (
        <TransportBtn onClick={onEnd} disabled={busy} label="إنهاء" icon={<Square />} tone="danger" />
      )}
    </span>
  )
}

function TransportBtn({
  onClick,
  disabled,
  label,
  icon,
  tone = "default",
}: {
  onClick: () => void
  disabled?: boolean
  label: string
  icon: React.ReactNode
  tone?: "default" | "go" | "danger"
}) {
  const cls =
    tone === "danger"
      ? "border-rose-500/30 bg-rose-500/10 text-rose-700 hover:bg-rose-500/20"
      : tone === "go"
        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20"
        : "border-border/50 text-muted-foreground hover:bg-background/70"
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={"inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-medium transition disabled:opacity-50 " + cls}
    >
      <span className="h-3.5 w-3.5">{icon}</span>
    </button>
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
