"use client"

/**
 * RoomTimerContext — recording timer state with live-updating elapsed time.
 *
 * Computes elapsed milliseconds client-side from server-synced reference points.
 * When recording is live: elapsed = recording_elapsed_ms + (now - recording_started_at)
 * When paused/ended: elapsed = recording_elapsed_ms
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import type { CollaborationRoom, RoomEvent } from "@/types/collaboration"
import { useRoomConnection } from "./room-connection-context"

// ─── Types ──────────────────────────────────────────────────────────

export type TimerStatus = "idle" | "running" | "paused" | "stopped"

interface RoomTimerContextValue {
  timerStatus: TimerStatus
  elapsedMs: number
  formattedTime: string

  // Actions (host only — caller must gate on role)
  startRecording: () => Promise<void>
  pauseRecording: () => Promise<void>
  resumeRecording: () => Promise<void>
  stopRecording: () => Promise<void>
  resetRecording: () => Promise<void>
}

// ─── Helpers ────────────────────────────────────────────────────────

function deriveTimerStatus(room: CollaborationRoom | null): TimerStatus {
  if (!room) return "idle"
  switch (room.status) {
    case "live": return "running"
    case "paused": return "paused"
    case "ended": return "stopped"
    default: return "idle"
  }
}

function computeElapsed(room: CollaborationRoom | null): number {
  if (!room) return 0
  if (room.status === "live" && room.recording_started_at) {
    return (room.recording_elapsed_ms || 0) + (Date.now() - new Date(room.recording_started_at).getTime())
  }
  return room.recording_elapsed_ms || 0
}

function formatMs(ms: number): string {
  const totalSec = Math.floor(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
}

// ─── Context ────────────────────────────────────────────────────────

const RoomTimerContext = createContext<RoomTimerContextValue | null>(null)

export function useRoomTimer() {
  const ctx = useContext(RoomTimerContext)
  if (!ctx) throw new Error("useRoomTimer must be used within RoomTimerProvider")
  return ctx
}

// ─── Provider ───────────────────────────────────────────────────────

export function RoomTimerProvider({
  prepId,
  roomId,
  children,
}: {
  prepId: string
  roomId: string
  children: ReactNode
}) {
  const { snapshot, subscribe } = useRoomConnection()

  const [room, setRoom] = useState<CollaborationRoom | null>(null)
  const [elapsedMs, setElapsedMs] = useState(0)
  const rafRef = useRef<number | null>(null)

  // ── Hydrate from snapshot ───────────────────────────────────────

  useEffect(() => {
    if (!snapshot) return
    const { cards, card_states, notes, markers, participants, ...roomData } = snapshot
    setRoom(roomData as CollaborationRoom)
  }, [snapshot])

  // ── Subscribe to room_update SSE events ─────────────────────────

  useEffect(() => {
    const unsub = subscribe((event: RoomEvent) => {
      if (event.type === "room_update") {
        setRoom(event.data as CollaborationRoom)
      }
    })
    return unsub
  }, [subscribe])

  // ── Tick loop (1s interval for running timer) ───────────────────

  useEffect(() => {
    const status = deriveTimerStatus(room)

    if (status === "running") {
      const tick = () => {
        setElapsedMs(computeElapsed(room))
        rafRef.current = window.setTimeout(tick, 1000) as unknown as number
      }
      tick()
    } else {
      setElapsedMs(computeElapsed(room))
    }

    return () => {
      if (rafRef.current !== null) {
        clearTimeout(rafRef.current)
        rafRef.current = null
      }
    }
  }, [room])

  // ── Derived ─────────────────────────────────────────────────────

  const timerStatus = deriveTimerStatus(room)
  const formattedTime = useMemo(() => formatMs(elapsedMs), [elapsedMs])

  // ── Actions ─────────────────────────────────────────────────────

  const patchRoom = useCallback(
    async (body: Record<string, unknown>) => {
      await fetch(`/api/admin/preparation/${prepId}/rooms/${roomId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-requested-with": "khat" },
        body: JSON.stringify(body),
      })
    },
    [prepId, roomId],
  )

  const startRecording = useCallback(() => patchRoom({ status: "live" }), [patchRoom])
  const pauseRecording = useCallback(() => patchRoom({ status: "paused" }), [patchRoom])
  const resumeRecording = useCallback(() => patchRoom({ status: "live" }), [patchRoom])
  const stopRecording = useCallback(() => patchRoom({ status: "ended" }), [patchRoom])
  const resetRecording = useCallback(() => patchRoom({ status: "waiting" }), [patchRoom])

  return (
    <RoomTimerContext.Provider
      value={{
        timerStatus,
        elapsedMs,
        formattedTime,
        startRecording,
        pauseRecording,
        resumeRecording,
        stopRecording,
        resetRecording,
      }}
    >
      {children}
    </RoomTimerContext.Provider>
  )
}
