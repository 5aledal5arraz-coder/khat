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
  EnergyDecisionEvent,
  EnergyDecisionKind,
  RoomParticipant,
  ParticipantRole,
  RoomEvent,
} from "@/types/collaboration"
import type { PrepV2Payload } from "@/lib/preparation/v2/types"
import { useRoomConnection } from "./room-connection-context"

// ─── Types ──────────────────────────────────────────────────────────

interface RoomStateContextValue {
  // Room metadata
  room: CollaborationRoom | null
  participants: RoomParticipant[]
  myParticipant: RoomParticipant | null

  /**
   * The preparation's prep_v2 as the SERVER last reported it — from the SSE
   * snapshot on (re)connect, then from `prep_update` events. `null` until the
   * first snapshot arrives, so callers fall back to their server-rendered
   * copy for the first paint and prefer this one after.
   *
   * Deliberately a separate slice, NOT a field on `room`: `room_update`
   * events replace `room` wholesale, which would drop the payload again.
   */
  prepV2: PrepV2Payload | null

  // Derived
  isHost: boolean
  isDirectorOrAbove: boolean
  onlineCount: number

  /**
   * The host's latest verdict on a director energy cue, as broadcast — the
   * director's receipt. `seq` increments on every event so a repeat of the same
   * decision still re-renders. Never persisted; cleared on nothing.
   */
  energyDecision: (EnergyDecisionEvent & { seq: number }) | null

  // Actions (host only)
  updatePhase: (phase: string) => Promise<void>
  updateEnergy: (level: number) => Promise<void>
  /**
   * Announce (and record) what the host did with a director's cue.
   * `approved` is the energy his ranking runs on AFTER the decision — it is what
   * the persisted marker stores, so the energy ribbon never plots a level the
   * host did not adopt.
   */
  sendEnergyDecision: (
    decision: EnergyDecisionKind,
    level: number,
    approved: number,
    muted: boolean,
  ) => Promise<void>
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
  const [prepV2, setPrepV2] = useState<PrepV2Payload | null>(null)
  const [energyDecision, setEnergyDecision] = useState<
    (EnergyDecisionEvent & { seq: number }) | null
  >(null)

  // Heartbeat interval
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Hydrate from snapshot ───────────────────────────────────────

  useEffect(() => {
    if (!snapshot) return
    // Every non-room slice must be destructured OUT here: whatever is left lands
    // on `room`, and a checklist hanging off `room` would be wiped by the next
    // `room_update` (which replaces the object wholesale). Its own provider owns
    // it — see room-checklist-context.tsx.
    const {
      cards,
      card_states,
      notes,
      participants: ps,
      prep_v2,
      checklist,
      ...roomData
    } = snapshot
    void checklist
    setRoom(roomData as CollaborationRoom)
    setParticipants(ps)
    setPrepV2(prep_v2 ?? null)
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

        case "prep_update":
          setPrepV2(event.data as PrepV2Payload)
          break

        case "energy_decision": {
          const d = event.data as EnergyDecisionEvent
          setEnergyDecision((prev) => ({ ...d, seq: (prev?.seq ?? 0) + 1 }))
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

    // Beat IMMEDIATELY, then on the interval. `setInterval` alone leaves the
    // first 30s with no heartbeat at all, and this PATCH is the only thing that
    // runs `sweepStaleParticipants` — so a room whose members all joined in the
    // last half-minute never cleared its stale rows, and a stale
    // `is_online = true` is what makes the checklist gate read "a director is
    // connected" when nobody is there.
    beat()

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

  const sendEnergyDecision = useCallback(
    async (decision: EnergyDecisionKind, level: number, approved: number, muted: boolean) => {
      try {
        await fetch(
          `/api/admin/preparation/${prepId}/rooms/${roomId}/energy-decision`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-requested-with": "khat" },
            body: JSON.stringify({ decision, level, approved, muted }),
          },
        )
      } catch {
        // Best-effort receipt — never fail the host's take over a status line.
      }
    },
    [prepId, roomId],
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
        // `keepalive` lets this outlive the document, which is what makes it
        // usable from a `beforeunload` handler. It replaces a `navigator
        // .sendBeacon` call that was being used for the same purpose — but
        // sendBeacon can only issue POST, and POST on this route means JOIN, so
        // closing a tab was re-joining the leaver with a fresh heartbeat and
        // pinning them online forever.
        keepalive: true,
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
        prepV2,
        energyDecision,
        isHost,
        isDirectorOrAbove,
        onlineCount,
        updatePhase,
        updateEnergy,
        sendEnergyDecision,
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
