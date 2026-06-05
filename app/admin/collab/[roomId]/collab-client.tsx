"use client"

/**
 * CollabClient — entry point for the live collaboration studio.
 *
 * 1. Wraps in RoomProvider (Connection → State → Cards → Timer → Markers)
 * 2. Auto-joins the room once SSE connection is established
 * 3. Renders the correct role-based studio view (role is server-assigned)
 * 4. Handles disconnected state with manual reconnect
 */

import { useEffect, useState, useCallback, useRef } from "react"
import { RoomProvider, useRoomConnection, useRoomState } from "@/app/admin/preparation/[id]/room/contexts"
import { StudioHeader } from "./studio-header"
import { HostStudioView } from "./host-studio-view"
import { DirectorStudioView } from "./director-studio-view"
import { ViewerStudioView } from "./viewer-studio-view"
import { Loader2, WifiOff, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"

// ─── Outer shell (provides RoomProvider) ─────────────────────────────

export function CollabClient({
  roomId,
  prepId,
  userName,
  userId,
}: {
  roomId: string
  prepId: string
  userName: string
  userId: string
}) {
  return (
    <RoomProvider prepId={prepId} roomId={roomId}>
      <RoomInner
        prepId={prepId}
        roomId={roomId}
        userName={userName}
        userId={userId}
      />
    </RoomProvider>
  )
}

// ─── Inner (inside provider, can use hooks) ──────────────────────────

function RoomInner({
  prepId,
  roomId,
  userName,
}: {
  prepId: string
  roomId: string
  userName: string
  userId: string
}) {
  const { status: connStatus } = useRoomConnection()
  const { joinRoom, leaveRoom, myParticipant } = useRoomState()

  const [joined, setJoined] = useState(false)
  const [joinError, setJoinError] = useState(false)
  const autoJoinAttempted = useRef(false)

  // ── Auto-join once connected ──────────────────────────────────

  useEffect(() => {
    if (connStatus !== "connected" || autoJoinAttempted.current) return
    autoJoinAttempted.current = true

    ;(async () => {
      const p = await joinRoom(userName)
      if (p) {
        setJoined(true)
      } else {
        setJoinError(true)
      }
    })()
  }, [connStatus, joinRoom, userName])

  // ── Leave on unmount / tab close ────────────────────────────────

  useEffect(() => {
    const handleBeforeUnload = () => {
      if (joined) {
        navigator.sendBeacon?.(
          `/api/admin/preparation/${prepId}/rooms/${roomId}/join`,
          "",
        )
      }
    }
    window.addEventListener("beforeunload", handleBeforeUnload)
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload)
      if (joined) leaveRoom()
    }
  }, [joined, leaveRoom, prepId, roomId])

  // ── Manual reconnect ───────────────────────────────────────────

  const handleReconnect = useCallback(() => {
    window.location.reload()
  }, [])

  // ── Connection lost after max retries ──────────────────────────

  if (connStatus === "disconnected" && joined) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center space-y-4">
          <WifiOff className="mx-auto h-12 w-12 text-muted-foreground/30" />
          <div>
            <h2 className="text-lg font-semibold">انقطع الاتصال</h2>
            <p className="mt-1 text-sm text-muted-foreground/60">
              فشل الاتصال بالغرفة بعد عدة محاولات
            </p>
          </div>
          <Button onClick={handleReconnect} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            إعادة الاتصال
          </Button>
        </div>
      </div>
    )
  }

  // ── Connecting / joining ───────────────────────────────────────

  if (!joined || !myParticipant) {
    if (joinError) {
      return (
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="text-center space-y-4">
            <h2 className="text-lg font-semibold">فشل الانضمام</h2>
            <p className="text-sm text-muted-foreground/60">
              لم يتمكن من الانضمام إلى الغرفة
            </p>
            <Button onClick={handleReconnect} variant="outline" className="gap-2">
              <RefreshCw className="h-4 w-4" />
              إعادة المحاولة
            </Button>
          </div>
        </div>
      )
    }

    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center space-y-3">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground/60">جاري الانضمام إلى الغرفة...</p>
        </div>
      </div>
    )
  }

  // ── Joined — render role-based studio view ────────────────────

  const role = myParticipant.role

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col overflow-hidden bg-background">
      <StudioHeader />

      <div className="min-h-0 flex-1">
        {role === "host" && <HostStudioView />}
        {role === "director" && <DirectorStudioView />}
        {(role === "photographer" || role === "editor" || role === "viewer") && (
          <ViewerStudioView />
        )}
      </div>
    </div>
  )
}
