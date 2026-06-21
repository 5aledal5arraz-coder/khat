"use client"

/**
 * RecordingClock — the cockpit's hero: a large, centered, high-precision
 * timer (HH:MM:SS.cc) with a live timeline beneath it.
 *
 * Isolated from LiveV2Client on purpose: it self-ticks via requestAnimationFrame
 * so the centiseconds + playhead update ~60fps WITHOUT re-rendering the rest of
 * the cockpit (questions, notes, marker list). The parent only passes the
 * infrequently-changing baseline (elapsedMsAtBaseline + windowStartedAt); the
 * elapsed time is derived from Date.now() each frame, so it stays accurate even
 * if the tab was backgrounded.
 *
 * The timeline plots every marker at its exact recording_ms, shows the planned
 * section structure as bands, and tracks a playhead at the current position.
 */

import { useEffect, useMemo, useState } from "react"
import { Play, Pause, Square, RotateCcw } from "lucide-react"
import type { LiveV2Marker, LiveV2Snapshot } from "@/lib/recording-v2/load"
import {
  SECTION_LABEL_AR,
  markerStyle,
  clockParts,
  formatPrecise,
  formatHms,
  niceScaleMs,
  computeElapsedMs,
} from "./recording-shared"

type Sections = NonNullable<LiveV2Snapshot["preparation"]["prep_v2"]>["episode_sections"]
type Status = "waiting" | "live" | "paused" | "ended"

export function RecordingClock(props: {
  status: Status
  elapsedMsAtBaseline: number
  windowStartedAt: number | null
  busy: boolean
  onStart: () => void
  onPause: () => void
  onResume: () => void
  onReset: () => void
  onEnd: () => void
  sections: Sections | null
  markers: LiveV2Marker[]
  currentSectionIndex: number
}) {
  const { status, elapsedMsAtBaseline, windowStartedAt } = props

  // ── Self-ticking display ─────────────────────────────────────────────
  // The rAF loop only forces a re-render each frame while live; the actual
  // elapsed is DERIVED during render from Date.now(), so it's always accurate
  // (no stale frame on start/pause, no synchronous setState in the effect).
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

  const elapsed = computeElapsedMs(elapsedMsAtBaseline, windowStartedAt, status === "live")
  const { hms, cs } = clockParts(elapsed)
  const live = status === "live"

  return (
    <div className="rounded-3xl border border-border/40 bg-background/50 p-5">
      {/* ── Big centered timer ──────────────────────────────────────── */}
      <div className="flex flex-col items-center">
        <div className="mb-1 inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          <span
            className={
              "inline-block h-2 w-2 rounded-full " +
              (live ? "bg-rose-500 animate-pulse" : status === "paused" ? "bg-amber-500" : "bg-muted-foreground/40")
            }
          />
          {STATUS_AR[status]}
        </div>
        <div
          className="flex items-baseline justify-center font-mono font-bold tabular-nums leading-none text-foreground"
          dir="ltr"
        >
          <span className="text-[clamp(56px,12vw,120px)]">{hms}</span>
          <span className="ms-1 text-[clamp(24px,5vw,52px)] text-muted-foreground/70">.{cs}</span>
        </div>

        {/* ── Controls (centered under the timer) ───────────────────── */}
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {status === "waiting" && (
            <CtrlButton onClick={props.onStart} disabled={props.busy} icon={<Play />}>بدء</CtrlButton>
          )}
          {status === "live" && (
            <>
              <CtrlButton onClick={props.onPause} disabled={props.busy} icon={<Pause />}>إيقاف مؤقت</CtrlButton>
              <CtrlButton onClick={props.onEnd} disabled={props.busy} variant="danger" icon={<Square />}>إنهاء</CtrlButton>
            </>
          )}
          {status === "paused" && (
            <>
              <CtrlButton onClick={props.onResume} disabled={props.busy} icon={<Play />}>استئناف</CtrlButton>
              <CtrlButton onClick={props.onEnd} disabled={props.busy} variant="danger" icon={<Square />}>إنهاء</CtrlButton>
            </>
          )}
          {status === "ended" && (
            <CtrlButton onClick={props.onReset} disabled={props.busy} icon={<RotateCcw />}>إعادة ضبط</CtrlButton>
          )}
          {status !== "ended" && status !== "waiting" && (
            <CtrlButton onClick={props.onReset} disabled={props.busy} variant="ghost" icon={<RotateCcw />}>إعادة ضبط</CtrlButton>
          )}
        </div>
      </div>

      {/* ── Timeline ────────────────────────────────────────────────── */}
      <Timeline
        elapsedMs={elapsed}
        sections={props.sections}
        markers={props.markers}
        currentSectionIndex={props.currentSectionIndex}
      />
    </div>
  )
}

// ─── Timeline ──────────────────────────────────────────────────────────

function Timeline(props: {
  elapsedMs: number
  sections: Sections | null
  markers: LiveV2Marker[]
  currentSectionIndex: number
}) {
  const { elapsedMs, sections, markers } = props

  const plannedMs = useMemo(
    () => (sections ? sections.reduce((a, s) => a + s.estimated_minutes * 60_000, 0) : 0),
    [sections],
  )
  const maxMarkerMs = useMemo(
    () => markers.reduce((mx, m) => Math.max(mx, m.recording_ms), 0),
    [markers],
  )

  // Scale to the RECORDED span (not the plan) so markers spread across the full
  // width and are visible from the very first tag — rounded up to a nice minute
  // mark for stable pin positions + headroom past the playhead.
  const scaleMax = niceScaleMs(Math.max(elapsedMs, maxMarkerMs))

  // Section bands clamped to the recorded scale — planned sections "grow into
  // view" as the recording progresses; sections not yet reached are hidden.
  const bands = useMemo(() => {
    if (!sections) return []
    let acc = 0
    return sections
      .map((s, i) => {
        const start = acc
        acc += s.estimated_minutes * 60_000
        const startPct = Math.min(100, (start / scaleMax) * 100)
        const endPct = Math.min(100, (acc / scaleMax) * 100)
        return { i, kind: s.kind, startPct, widthPct: Math.max(0, endPct - startPct) }
      })
      .filter((b) => b.widthPct > 0)
  }, [sections, scaleMax])

  const playheadPct = Math.min(100, (elapsedMs / scaleMax) * 100)

  return (
    <div className="mt-5">
      <div className="mb-1 flex items-center justify-between text-[10px] tabular-nums text-muted-foreground" dir="ltr">
        <span>00:00</span>
        <span>{clockParts(scaleMax).hms}</span>
      </div>
      <div
        className="relative h-9 w-full overflow-hidden rounded-xl border border-border/40 bg-background/40"
        dir="ltr"
      >
        {/* Section bands */}
        {bands.map((b) => (
          <div
            key={b.kind}
            title={SECTION_LABEL_AR[b.kind] ?? b.kind}
            className={
              // Timeline is intentionally dir="ltr" (time flows left→right), so
              // all positioned children use physical left for consistency.
              "absolute inset-y-0 border-r border-border/30 " +
              (b.i === props.currentSectionIndex ? "bg-violet-500/15" : b.i % 2 === 0 ? "bg-muted/10" : "bg-transparent")
            }
            style={{ left: `${b.startPct}%`, width: `${b.widthPct}%` }}
          />
        ))}

        {/* Elapsed fill */}
        <div
          className="absolute inset-y-0 left-0 bg-primary/10"
          style={{ width: `${playheadPct}%` }}
        />

        {/* Marker pins at exact recording_ms */}
        {markers.map((m) => {
          const st = markerStyle(m.marker_type)
          const pct = Math.min(100, Math.max(0, (m.recording_ms / scaleMax) * 100))
          return (
            <div
              key={m.id}
              className="group absolute top-0 bottom-0 z-10 -ml-px w-0.5"
              style={{ left: `${pct}%` }}
              title={`${st.label} · ${formatPrecise(m.recording_ms)}`}
            >
              <span className={"block h-full w-0.5 " + st.dot} />
              <span
                className={
                  "absolute -top-1 left-1/2 h-2.5 w-2.5 -translate-x-1/2 rounded-full ring-2 ring-background " +
                  st.dot
                }
              />
            </div>
          )
        })}

        {/* Playhead */}
        <div
          className="absolute top-0 bottom-0 z-20 w-px bg-foreground/70"
          style={{ left: `${playheadPct}%` }}
        >
          <span className="absolute -top-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 bg-foreground/80" />
        </div>
      </div>

      {/* Legend (marker types present) + planned-duration reference */}
      <TimelineLegend markers={markers} plannedMs={plannedMs} />
    </div>
  )
}

function TimelineLegend({ markers, plannedMs }: { markers: LiveV2Marker[]; plannedMs: number }) {
  const present = useMemo(() => {
    const seen = new Set<string>()
    for (const m of markers) seen.add(m.marker_type)
    return [...seen]
  }, [markers])
  if (present.length === 0 && plannedMs <= 0) return null
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
      {present.map((t) => {
        const st = markerStyle(t)
        return (
          <span key={t} className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
            <span className={"h-2 w-2 rounded-full " + st.dot} />
            {st.label}
          </span>
        )
      })}
      {plannedMs > 0 && (
        <span className="ms-auto text-[10px] text-muted-foreground/80">
          المخطّط ~<span dir="ltr" className="tabular-nums">{formatHms(plannedMs)}</span>
        </span>
      )}
    </div>
  )
}

// ─── Bits ──────────────────────────────────────────────────────────────

const STATUS_AR: Record<Status, string> = {
  waiting: "بانتظار البدء",
  live: "تسجيل مباشر",
  paused: "متوقّف مؤقّتاً",
  ended: "انتهى التسجيل",
}

function CtrlButton(props: {
  onClick: () => void
  disabled?: boolean
  icon?: React.ReactNode
  children: React.ReactNode
  variant?: "default" | "ghost" | "danger"
}) {
  const base =
    "inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-[13px] font-semibold transition disabled:opacity-50"
  const variant =
    props.variant === "danger"
      ? "border border-rose-500/30 bg-rose-500/10 text-rose-700 hover:bg-rose-500/20"
      : props.variant === "ghost"
        ? "text-muted-foreground hover:text-foreground"
        : "border border-violet-500/30 bg-violet-500/10 text-violet-700 hover:bg-violet-500/20"
  return (
    <button type="button" onClick={props.onClick} disabled={props.disabled} className={`${base} ${variant}`}>
      {props.icon && <span className="h-4 w-4">{props.icon}</span>}
      {props.children}
    </button>
  )
}
