"use client"

/**
 * RoomStateContext — room metadata + participants.
 *
 * Hydrated from the initial snapshot, then updated by SSE events:
 *   - room_update → room metadata (status, phase, energy, active_card, host_notes)
 *   - participant_update → participant join/leave/heartbeat
 *
 * Provides API action helpers for host/director operations.
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
import type {
  CollaborationRoom,
  CollaborationRoomStatus,
  RoomParticipant,
  ParticipantRole,
  RoomEvent,
} from "@/types/collaboration"
import { useRoomConnection } from "./room-connection-context"

// ─── Types ──────────────────────────────────────────────────────────

interface RoomStateContextValue {
  // Room metadata
  room: CollaborationRoom | null
  participants: RoomParticipant[]
  myParticipant: RoomParticipant | null

  // Derived
  isHost: boolean
  isDirectorOrAbove: boolean
  onlineCount: number

  // Actions (host only)
  updatePhase: (phase: string) => Promise<void>
  updateEnergy: (level: number) => Promise<void>
  updateStatus: (status: CollaborationRoomStatus) => Promise<void>
  setActiveCard: (cardId: string | null) => Promise<void>
  updateHostNotes: (notes: string) => Promise<void>

  // Participant actions
  joinRoom: (displayName?: string) => Promise<RoomParticipant | null>
  leaveRoom: () => Promise<void>
}

const ROLE_RANK: Record<ParticipantRole, number> = {
  host: 5,
  director: 4,
  photographer: 3,
  editor: 2,
  viewer: 1,
}

// ─── Context ────────────────────────────────────────────────────────

const RoomStateContext = createContext<RoomStateContextValue | null>(null)

export function useRoomState() {
  const ctx = useContext(RoomStateContext)
  if (!ctx) throw new Error("useRoomState must be used within RoomStateProvider")
  return ctx
}

// ─── Provider ───────────────────────────────────────────────────────

export function RoomStateProvider({
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
  const [participants, setParticipants] = useState<RoomParticipant[]>([])
  const [myParticipantId, setMyParticipantId] = useState<string | null>(null)

  // Heartbeat interval
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Hydrate from snapshot ───────────────────────────────────────

  useEffect(() => {
    if (!snapshot) return
    const { cards, card_states, notes, participants: ps, ...roomData } = snapshot
    setRoom(roomData as CollaborationRoom)
    setParticipants(ps)
  }, [snapshot])

  // ── Subscribe to SSE events ─────────────────────────────────────

  useEffect(() => {
    const unsub = subscribe((event: RoomEvent) => {
      switch (event.type) {
        case "room_update":
          setRoom(event.data as CollaborationRoom)
          break

        case "participant_update": {
          const p = event.data as RoomParticipant
          setParticipants((prev) => {
            const exists = prev.find((x) => x.id === p.id)
            if (exists) {
              return prev.map((x) => (x.id === p.id ? { ...x, ...p } : x))
            }
            // New participant
            return [...prev, p]
          })
          break
        }
      }
    })
    return unsub
  }, [subscribe])

  // ── Heartbeat ───────────────────────────────────────────────────

  useEffect(() => {
    if (!myParticipantId) return

    const beat = () => {
      fetch(`/api/admin/preparation/${prepId}/rooms/${roomId}/join`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-requested-with": "khat" },
        body: JSON.stringify({ participant_id: myParticipantId }),
      }).catch(() => {})
    }

    heartbeatRef.current = setInterval(beat, 30_000)
    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current)
    }
  }, [myParticipantId, prepId, roomId])

  // ── Derived state ───────────────────────────────────────────────

  const myParticipant = useMemo(
    () => participants.find((p) => p.id === myParticipantId) ?? null,
    [participants, myParticipantId],
  )

  const isHost = myParticipant?.role === "host"
  const isDirectorOrAbove = myParticipant
    ? ROLE_RANK[myParticipant.role] >= ROLE_RANK.director
    : false
  const onlineCount = participants.filter((p) => p.is_online).length

  // ── Room update helper ──────────────────────────────────────────

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

  // ── Actions ─────────────────────────────────────────────────────

  const updatePhase = useCallback(
    (phase: string) => patchRoom({ phase }),
    [patchRoom],
  )

  const updateEnergy = useCallback(
    (level: number) => patchRoom({ energy_level: level }),
    [patchRoom],
  )

  const updateStatus = useCallback(
    (status: CollaborationRoomStatus) => patchRoom({ status }),
    [patchRoom],
  )

  const setActiveCard = useCallback(
    (cardId: string | null) => patchRoom({ active_card_id: cardId }),
    [patchRoom],
  )

  const updateHostNotes = useCallback(
    (notes: string) => patchRoom({ host_notes: notes }),
    [patchRoom],
  )

  const joinRoomAction = useCallback(
    async (displayName?: string): Promise<RoomParticipant | null> => {
      try {
        const res = await fetch(`/api/admin/preparation/${prepId}/rooms/${roomId}/join`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-requested-with": "khat" },
          body: JSON.stringify({ display_name: displayName }),
        })
        if (res.ok) {
          const p: RoomParticipant = await res.json()
          setMyParticipantId(p.id)
          return p
        }
      } catch {
        // silent
      }
      return null
    },
    [prepId, roomId],
  )

  const leaveRoomAction = useCallback(async () => {
    if (!myParticipantId) return
    try {
      await fetch(`/api/admin/preparation/${prepId}/rooms/${roomId}/join`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json", "x-requested-with": "khat" },
        body: JSON.stringify({ participant_id: myParticipantId }),
      })
    } catch {
      // silent
    }
    setMyParticipantId(null)
    if (heartbeatRef.current) clearInterval(heartbeatRef.current)
  }, [myParticipantId, prepId, roomId])

  return (
    <RoomStateContext.Provider
      value={{
        room,
        participants,
        myParticipant,
        isHost,
        isDirectorOrAbove,
        onlineCount,
        updatePhase,
        updateEnergy,
        updateStatus,
        setActiveCard,
        updateHostNotes,
        joinRoom: joinRoomAction,
        leaveRoom: leaveRoomAction,
      }}
    >
      {children}
    </RoomStateContext.Provider>
  )
}
