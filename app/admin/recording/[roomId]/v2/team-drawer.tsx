"use client"

/**
 * TeamDrawer — the pulled-on-demand team panel (on-air).
 *
 * The interruption fix: instead of two overlays floating over the host, the
 * team's notes + markers live here, opened from the StatusRail's quiet team
 * indicator. Reuses the existing RoomNotesPanel (inline, host, all notes) and
 * TeamMarkerFeed (inline, deletable) — same contexts, same SSE, no backend
 * change; only the presentation moved from always-on to on-demand.
 */

import { Users, X } from "lucide-react"
import { RoomNotesPanel } from "./room-notes-panel"
import { TeamMarkerFeed } from "./participant-room-view"

export function TeamDrawer({
  open,
  onClose,
  sectionKey,
}: {
  open: boolean
  onClose: () => void
  sectionKey?: string
}) {
  if (!open) return null
  return (
    <div className="rounded-2xl border border-border/40 bg-background/40 p-3.5">
      <div className="mb-2.5 flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-foreground/85">
          <Users className="h-4 w-4 text-violet-600" /> الفريق
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="إغلاق"
          className="rounded-lg border border-border/50 p-1 text-muted-foreground transition hover:bg-background/70"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <RoomNotesPanel role="host" sectionKey={sectionKey} showAll />
        <TeamMarkerFeed canDelete />
      </div>
    </div>
  )
}
