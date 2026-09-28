"use client"

/**
 * StatusRail — the glanceable bar at the top of the ON-AIR view.
 *
 * Everything the host needs in his periphery, in one band that never competes
 * with the question: live state + net clock, pause, the current section with
 * its time against plan, energy, the team, the connection — and, at the far
 * end, away from pause, «إنهاء».
 *
 * It is STICKY. It used to scroll with the page, and the team panel and the
 * section grid opened inline above the question and pushed it off the top —
 * measured at −56px — taking pause and end with it. Those panels are overlays
 * now, and the rail stays pinned under the page header whatever is open.
 */

import { useEffect, useState, useSyncExternalStore } from "react"
import { Users, Wifi, Loader2, Bolt, RefreshCw } from "lucide-react"
import { useRoomCards, useRoomConnection, useRoomMarkers } from "@/app/admin/preparation/[id]/room/contexts"
import { cn } from "@/lib/utils"
import { formatMinSec, sectionTime } from "@/lib/recording-v2/live-sync"
import { CompactEnergyControl } from "./cockpit-bits"
import { CompactClock, EndTakeControl, PauseResumeButton } from "./cockpit-clock"
import { computeElapsedMs } from "./recording-shared"

export function StatusRail({
  status,
  elapsedMsAtBaseline,
  windowStartedAt,
  busy,
  onPause,
  onResume,
  onEnd,
  sectionLabel,
  sectionStartedMs,
  sectionEstimatedMinutes,
  energy,
  approvedEnergy,
  canSetEnergy,
  onSetEnergy,
  onOpenTeam,
}: {
  status: "waiting" | "live" | "paused" | "ended"
  elapsedMsAtBaseline: number
  windowStartedAt: number | null
  busy: boolean
  onPause: () => void
  onResume: () => void
  onEnd: () => void
  /** The section's name — shown ONCE on the on-air screen, here. */
  sectionLabel: string | null
  /** NET ms the current section began at (server-stamped), or null if unknown. */
  sectionStartedMs: number | null
  /** The section's planned length (prep `estimated_minutes`). */
  sectionEstimatedMinutes: number | null
  energy: number
  /** The ranking energy, so the rail can say so when it differs from displayed. */
  approvedEnergy?: number
  canSetEnergy: boolean
  onSetEnergy: (level: number) => void
  onOpenTeam: () => void
}) {
  const live = status === "live"
  const paused = status === "paused"
  return (
    <div
      // `top-9` = the page header's fixed h-9 (page.tsx), so the rail parks
      // directly beneath it instead of sliding under it.
      className="sticky top-9 z-20 -mx-1 rounded-2xl border border-border/50 bg-card/95 text-[14px] shadow-sm backdrop-blur"
      dir="rtl"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-1.5">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 font-semibold",
            live ? "text-rose-700" : paused ? "text-amber-700" : "text-muted-foreground",
          )}
        >
          <span
            className={cn(
              "h-2.5 w-2.5 rounded-full",
              // Steady. It pulsed for the whole take — the one thing in the
              // host's periphery that never stopped moving; «مباشر» says it.
              live ? "bg-rose-500" : paused ? "bg-amber-500" : "bg-muted-foreground/40",
            )}
          />
          {live ? "مباشر" : paused ? "متوقّف" : "—"}
        </span>
        <CompactClock
          status={status}
          elapsedMsAtBaseline={elapsedMsAtBaseline}
          windowStartedAt={windowStartedAt}
        />
        <PauseResumeButton status={status} busy={busy} onPause={onPause} onResume={onResume} />

        <Divider />

        {sectionLabel && (
          <SectionTimer
            label={sectionLabel}
            status={status}
            elapsedMsAtBaseline={elapsedMsAtBaseline}
            windowStartedAt={windowStartedAt}
            sectionStartedMs={sectionStartedMs}
            estimatedMinutes={sectionEstimatedMinutes}
          />
        )}

        <Divider />

        <CompactEnergyControl
          level={energy}
          approvedLevel={approvedEnergy}
          interactive={canSetEnergy}
          onSet={onSetEnergy}
        />

        <span className="ms-auto inline-flex flex-wrap items-center gap-2">
          <TeamIndicator onOpen={onOpenTeam} />
          <ConnectionState />
          {(live || paused) && <EndTakeControl busy={busy} onEnd={onEnd} />}
        </span>
      </div>

      {/* Paused: say it across the whole width, once, calmly. The cameras keep
          rolling through a pause (Khaled's locked decision) — the band says so,
          so nobody reads "متوقّف" as "we can stop being on camera". */}
      {paused && (
        <div className="rounded-b-2xl border-t border-amber-500/30 bg-amber-500/15 px-3 py-1 text-center text-[14px] font-semibold text-amber-800">
          متوقّف — الكاميرات تشتغل
        </div>
      )}
    </div>
  )
}

const subscribeNothing = () => () => {}

function Divider() {
  return <span className="h-4 w-px bg-border" aria-hidden />
}

/**
 * «المواجهة 6:12 / 12د» — time in the current section against its plan.
 *
 * Amber once the plan is used up, with how far over («+2د»). No pulse: over
 * time is information for a glance, not an alarm. Shows "—" rather than a
 * guess when the section start is unknown.
 */
export function SectionTimer({
  label,
  status,
  elapsedMsAtBaseline,
  windowStartedAt,
  sectionStartedMs,
  estimatedMinutes,
}: {
  label: string
  status: "waiting" | "live" | "paused" | "ended"
  elapsedMsAtBaseline: number
  windowStartedAt: number | null
  sectionStartedMs: number | null
  estimatedMinutes: number | null
}) {
  const [, setTick] = useState(0)
  useEffect(() => {
    if (status !== "live") return
    const id = window.setInterval(() => setTick((t) => (t + 1) % 1_000_000), 1000)
    return () => window.clearInterval(id)
  }, [status])
  // Client-only: the value comes from Date.now(), and the over-time branch
  // changes the element STRUCTURE («+Nد» appears or not), which
  // suppressHydrationWarning cannot paper over. The server (and the hydration
  // pass) render the timeless form; the first client render fills it in.
  const mounted = useSyncExternalStore(subscribeNothing, () => true, () => false)
  const net = computeElapsedMs(elapsedMsAtBaseline, windowStartedAt, status === "live")
  const t =
    !mounted || sectionStartedMs == null ? null : sectionTime(net - sectionStartedMs, estimatedMinutes)
  const plannedMin =
    typeof estimatedMinutes === "number" && estimatedMinutes > 0 ? Math.round(estimatedMinutes) : null
  return (
    <span
      className={cn(
        "inline-flex items-baseline gap-1.5",
        t?.over ? "text-amber-700" : "text-foreground",
      )}
    >
      <span className="font-medium">{label}</span>
      <span className="tabular-nums" dir="ltr">
        {t ? formatMinSec(t.elapsedSec) : "—"}
      </span>
      {plannedMin != null && <span className="text-muted-foreground">/ {plannedMin}د</span>}
      {t?.over && t.overMin > 0 && <span className="font-semibold">+{t.overMin}د</span>}
    </span>
  )
}

/**
 * Quiet, counted team pill. An unseen URGENT note pulses it twice — then it
 * stays tinted. It used to pulse for as long as the note stayed unseen, which
 * is a moving object in the host's eyeline for the rest of the answer.
 */
function TeamIndicator({ onOpen }: { onOpen: () => void }) {
  const { notes, unseenNotesCount } = useRoomCards()
  const { markers } = useRoomMarkers()
  const markerCount = markers.filter((m) => m.marker_type !== "energy_change").length
  const hasUrgent = notes.some(
    (n) => n.note_type === "urgent" && !n.is_seen_by_host && !n.resolved_at,
  )
  return (
    <button
      type="button"
      onClick={onOpen}
      title="ملاحظات وعلامات الفريق"
      className={cn(
        "inline-flex min-h-[44px] items-center gap-1.5 rounded-full px-3 text-[14px] font-medium transition",
        hasUrgent
          ? "animate-[pulse_1s_ease-in-out_2] bg-rose-500/15 text-rose-700 hover:bg-rose-500/25"
          : unseenNotesCount > 0
            ? "bg-amber-500/15 text-amber-700 hover:bg-amber-500/25"
            : "text-foreground hover:bg-background/70",
      )}
    >
      <Users className="h-4 w-4" /> الفريق
      {unseenNotesCount > 0 && (
        <span className="inline-flex items-center gap-0.5" dir="ltr">
          ✉{unseenNotesCount}
        </span>
      )}
      {markerCount > 0 && (
        <span className="inline-flex items-center gap-0.5 text-muted-foreground" dir="ltr">
          <Bolt className="h-3.5 w-3.5" />
          {markerCount}
        </span>
      )}
    </button>
  )
}

/**
 * The connection, in words when it matters.
 *
 * A red Wi-Fi glyph was the only sign that the stream had given up — and once
 * the automatic retries are spent the room stays dead until someone acts. So a
 * dead stream is a sentence and a button: the team is no longer seeing what
 * the host does.
 */
function ConnectionState() {
  const { status, reconnect } = useRoomConnection()
  if (status === "connected") {
    return <Wifi className="h-4 w-4 text-emerald-600" aria-label="متّصل" />
  }
  if (status === "connecting" || status === "reconnecting") {
    return <Loader2 className="h-4 w-4 animate-spin text-amber-600" aria-label="يتّصل" />
  }
  return (
    <button
      type="button"
      onClick={reconnect}
      className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-rose-500/40 bg-rose-500/10 px-3 text-[14px] font-semibold text-rose-700"
    >
      <RefreshCw className="h-4 w-4" /> الفريق ما يشوف تحديثاتك · أعد الاتصال
    </button>
  )
}
