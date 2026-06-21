"use client"

/**
 * RecordingRoomShell — Phase 1 of folding the V1 collab room into V2.
 *
 * Wraps the V2 recording cockpit in the shared real-time room contexts
 * (RoomProvider: Connection → State → Cards → Timer → Markers), auto-joins
 * the operator, and surfaces live presence + connection status. This makes
 * the V2 page a genuine multi-participant room (others can join and are seen
 * live over SSE) without changing the cockpit body. Role-specific participant
 * views on the prep_v2 model land in the next phase; until then the legacy
 * /admin/collab room remains the full multi-role experience.
 */

import { useEffect, useRef } from "react"
import {
  RoomProvider,
  useRoomConnection,
  useRoomState,
} from "@/app/admin/preparation/[id]/room/contexts"
import { LiveV2Client } from "./live-v2-client"
import { ParticipantRoomView, TeamMarkerFeed } from "./participant-room-view"
import { RoomNotesPanel } from "./room-notes-panel"
import type { LiveV2Snapshot } from "@/lib/recording-v2/load"
import { Loader2, Users, Wifi, WifiOff } from "lucide-react"

export function RecordingRoomShell({
  initial,
  userName,
}: {
  initial: LiveV2Snapshot
  userName: string
}) {
  return (
    <RoomProvider
      prepId={initial.room.preparation_id}
      roomId={initial.room.id}
    >
      <RoomShellInner
        initial={initial}
        userName={userName}
        prepId={initial.room.preparation_id}
        roomId={initial.room.id}
      />
    </RoomProvider>
  )
}

function RoomShellInner({
  initial,
  userName,
  prepId,
  roomId,
}: {
  initial: LiveV2Snapshot
  userName: string
  prepId: string
  roomId: string
}) {
  const { status: connStatus } = useRoomConnection()
  const { joinRoom, leaveRoom, myParticipant, participants } = useRoomState()
  const autoJoinAttempted = useRef(false)

  // Auto-join once the SSE connection is live (mirrors the collab room).
  useEffect(() => {
    if (connStatus !== "connected" || autoJoinAttempted.current) return
    autoJoinAttempted.current = true
    void joinRoom(userName)
  }, [connStatus, joinRoom, userName])

  // Best-effort leave on unmount / tab close so presence stays accurate.
  useEffect(() => {
    const onUnload = () => {
      navigator.sendBeacon?.(
        `/api/admin/preparation/${prepId}/rooms/${roomId}/join`,
        "",
      )
    }
    window.addEventListener("beforeunload", onUnload)
    return () => {
      window.removeEventListener("beforeunload", onUnload)
      void leaveRoom()
    }
  }, [leaveRoom, prepId, roomId])

  // Host (and the operator before the join resolves) drives the cockpit;
  // everyone else gets the role-based live follow-along on prep_v2.
  const role = myParticipant?.role
  const isHostOrOperator = !role || role === "host"

  return (
    <>
      <PresenceStrip
        connStatus={connStatus}
        online={participants.filter((p) => p.is_online).length}
        joinedAs={role ?? null}
      />
      {isHostOrOperator ? (
        <>
          <LiveV2Client initial={initial} />
          {/* Live overlays on the cockpit: director markers + incoming team notes */}
          <TeamMarkerFeed floating />
          <RoomNotesPanel floating role="host" />
        </>
      ) : (
        <ParticipantRoomView initial={initial} role={role} />
      )}
    </>
  )
}

const ROLE_LABEL_AR: Record<string, string> = {
  host: "المضيف",
  director: "المخرج",
  photographer: "المصوّر",
  editor: "المحرّر",
  viewer: "مشاهد",
}

function PresenceStrip({
  connStatus,
  online,
  joinedAs,
}: {
  connStatus: string
  online: number
  joinedAs: string | null
}) {
  const connected = connStatus === "connected"
  const connecting = connStatus === "connecting" || connStatus === "reconnecting"
  return (
    <div className="border-b border-border/40 bg-muted/20 px-4 py-1.5">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 text-[11px]">
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          <Users className="h-3 w-3" />
          {online} متصل الآن
          {joinedAs && (
            <span className="rounded-full bg-violet-500/10 px-1.5 py-0.5 text-violet-700">
              أنت: {ROLE_LABEL_AR[joinedAs] ?? joinedAs}
            </span>
          )}
        </span>
        <span
          className={
            "inline-flex items-center gap-1 " +
            (connected
              ? "text-emerald-700"
              : connecting
                ? "text-amber-700"
                : "text-rose-700")
          }
        >
          {connecting ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : connected ? (
            <Wifi className="h-3 w-3" />
          ) : (
            <WifiOff className="h-3 w-3" />
          )}
          {connected ? "مباشر" : connecting ? "يتّصل…" : "غير متّصل"}
        </span>
      </div>
    </div>
  )
}
