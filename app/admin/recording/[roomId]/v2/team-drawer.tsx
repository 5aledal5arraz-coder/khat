"use client"

/**
 * TeamDrawer — the pulled-on-demand team panel (on-air).
 *
 * The team's notes + markers, opened from the StatusRail's quiet team
 * indicator. It is an OVERLAY sheet now (side sheet on iPad landscape): it used
 * to open inline above the question and push the question and the rail — pause
 * and end included — off the top of the screen.
 *
 * The host may delete only markers HE made. The director and the editor keep
 * deleting any marker (Khaled: «الاثنين يقدرون يحذفون كل العلامات»); the host
 * is mid-interview and a stray tap there would remove the director's flag.
 */

import { useRoomState } from "@/app/admin/preparation/[id]/room/contexts"
import { RoomNotesPanel } from "./room-notes-panel"
import { TeamMarkerFeed } from "./participant-room-view"
import { Sheet } from "./cockpit-bits"

export function TeamDrawer({
  open,
  onClose,
  sectionKey,
}: {
  open: boolean
  onClose: () => void
  sectionKey?: string
}) {
  const { myParticipant } = useRoomState()
  const myId = myParticipant?.id ?? null
  return (
    <Sheet open={open} onClose={onClose} title="الفريق">
      <div className="grid gap-3">
        <RoomNotesPanel role="host" sectionKey={sectionKey} showAll />
        <TeamMarkerFeed canDelete={(m) => myId != null && m.author_id === myId} />
      </div>
    </Sheet>
  )
}
