"use client"

/**
 * StatusRail — the thin glanceable bar at the top of the ON-AIR view.
 *
 * Everything the host needs in their periphery, compressed into one line so it
 * never competes with the question hero: live/elapsed, section + position,
 * compact energy, connection, and a QUIET team indicator. The team indicator
 * is the interruption fix — instead of a panel popping over the host, unseen
 * team input becomes a counted pill that pulses amber only when something is
 * urgent, and opens the team drawer on demand.
 */

import { Users, Wifi, WifiOff, Loader2, Bolt } from "lucide-react"
import { useRoomCards, useRoomConnection, useRoomMarkers } from "@/app/admin/preparation/[id]/room/contexts"
import { CompactEnergyControl } from "./cockpit-bits"
import { CompactClock, Transport } from "./cockpit-clock"

export function StatusRail({
  status,
  elapsedMsAtBaseline,
  windowStartedAt,
  busy,
  onPause,
  onResume,
  onEnd,
  sectionLabel,
  sectionIndex,
  sectionTotal,
  energy,
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
  sectionLabel: string | null
  sectionIndex: number
  sectionTotal: number
  energy: number
  canSetEnergy: boolean
  onSetEnergy: (level: number) => void
  onOpenTeam: () => void
}) {
  const live = status === "live"
  const paused = status === "paused"
  return (
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-2xl border border-border/40 bg-background/50 px-3.5 py-2 text-[12px]"
      dir="rtl"
    >
      <span
        className={
          "inline-flex items-center gap-1.5 font-medium " +
          (live ? "text-rose-600" : paused ? "text-amber-700" : "text-muted-foreground")
        }
      >
        <span
          className={
            "h-2 w-2 rounded-full " +
            (live ? "animate-pulse bg-rose-500" : paused ? "bg-amber-500" : "bg-muted-foreground/40")
          }
        />
        {live ? "مباشر" : paused ? "متوقّف" : "—"}
      </span>
      <CompactClock
        status={status}
        elapsedMsAtBaseline={elapsedMsAtBaseline}
        windowStartedAt={windowStartedAt}
      />
      <Transport
        status={status}
        busy={busy}
        onPause={onPause}
        onResume={onResume}
        onEnd={onEnd}
      />

      <Divider />

      {sectionLabel && (
        <span className="inline-flex items-center gap-1 text-foreground/85">
          {sectionLabel}
          <span className="text-muted-foreground" dir="ltr">
            {sectionIndex + 1}/{sectionTotal}
          </span>
        </span>
      )}

      <Divider />

      <CompactEnergyControl level={energy} interactive={canSetEnergy} onSet={onSetEnergy} />

      <span className="ms-auto inline-flex items-center gap-2.5">
        <TeamIndicator onOpen={onOpenTeam} />
        <ConnectionDot />
      </span>
    </div>
  )
}

function Divider() {
  return <span className="h-3.5 w-px bg-border/60" />
}

/** Quiet, counted team pill — pulses amber only when an unseen urgent note exists. */
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
      className={
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-medium transition " +
        (hasUrgent
          ? "animate-pulse bg-rose-500/15 text-rose-700 hover:bg-rose-500/25"
          : unseenNotesCount > 0
            ? "bg-amber-500/15 text-amber-700 hover:bg-amber-500/25"
            : "text-muted-foreground hover:bg-background/70")
      }
    >
      <Users className="h-3.5 w-3.5" /> الفريق
      {unseenNotesCount > 0 && (
        <span className="inline-flex items-center gap-0.5" dir="ltr">
          ✉{unseenNotesCount}
        </span>
      )}
      {markerCount > 0 && (
        <span className="inline-flex items-center gap-0.5 text-muted-foreground" dir="ltr">
          <Bolt className="h-3 w-3" />
          {markerCount}
        </span>
      )}
    </button>
  )
}

function ConnectionDot() {
  const { status } = useRoomConnection()
  const connected = status === "connected"
  const connecting = status === "connecting" || status === "reconnecting"
  if (connecting) return <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-600" aria-label="يتّصل" />
  if (connected) return <Wifi className="h-3.5 w-3.5 text-emerald-600" aria-label="متّصل" />
  return <WifiOff className="h-3.5 w-3.5 text-rose-600" aria-label="غير متّصل" />
}
