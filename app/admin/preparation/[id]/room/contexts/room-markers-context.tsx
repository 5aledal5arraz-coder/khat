"use client"

/**
 * RoomMarkersContext — session markers (timestamped events during recording).
 *
 * Hydrated from snapshot, then updated by SSE:
 *   - marker_added   → new marker from team
 *   - marker_deleted → marker removed
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react"
import type {
  RoomSessionMarker,
  SessionMarkerType,
  RoomEvent,
} from "@/types/collaboration"
import { useRoomConnection } from "./room-connection-context"

// ─── Types ──────────────────────────────────────────────────────────

interface RoomMarkersContextValue {
  markers: RoomSessionMarker[]

  // Actions (director+ — caller must gate on role)
  addMarker: (type: SessionMarkerType, label: string, note?: string) => Promise<void>
  deleteMarker: (id: string) => Promise<void>
}

// ─── Context ────────────────────────────────────────────────────────

const RoomMarkersContext = createContext<RoomMarkersContextValue | null>(null)

export function useRoomMarkers() {
  const ctx = useContext(RoomMarkersContext)
  if (!ctx) throw new Error("useRoomMarkers must be used within RoomMarkersProvider")
  return ctx
}

// ─── Provider ───────────────────────────────────────────────────────

export function RoomMarkersProvider({
  prepId,
  roomId,
  children,
}: {
  prepId: string
  roomId: string
  children: ReactNode
}) {
  const { snapshot, subscribe } = useRoomConnection()

  const [markers, setMarkers] = useState<RoomSessionMarker[]>([])

  // ── Hydrate from snapshot ───────────────────────────────────────

  useEffect(() => {
    if (!snapshot) return
    setMarkers(snapshot.markers ?? [])
  }, [snapshot])

  // ── Subscribe to SSE events ─────────────────────────────────────

  useEffect(() => {
    const unsub = subscribe((event: RoomEvent) => {
      switch (event.type) {
        case "marker_added": {
          const m = event.data as RoomSessionMarker
          setMarkers((prev) => [...prev, m].sort((a, b) => a.recording_ms - b.recording_ms))
          break
        }
        case "marker_deleted": {
          const { id } = event.data as { id: string }
          setMarkers((prev) => prev.filter((m) => m.id !== id))
          break
        }
      }
    })
    return unsub
  }, [subscribe])

  // ── Actions ─────────────────────────────────────────────────────

  const apiBase = `/api/admin/preparation/${prepId}/rooms/${roomId}/markers`

  const addMarkerAction = useCallback(
    async (type: SessionMarkerType, label: string, note?: string) => {
      await fetch(apiBase, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-requested-with": "khat" },
        body: JSON.stringify({ marker_type: type, label, note }),
      })
    },
    [apiBase],
  )

  const deleteMarkerAction = useCallback(
    async (id: string) => {
      await fetch(apiBase, {
        method: "DELETE",
        headers: { "Content-Type": "application/json", "x-requested-with": "khat" },
        body: JSON.stringify({ marker_id: id }),
      })
    },
    [apiBase],
  )

  return (
    <RoomMarkersContext.Provider
      value={{
        markers,
        addMarker: addMarkerAction,
        deleteMarker: deleteMarkerAction,
      }}
    >
      {children}
    </RoomMarkersContext.Provider>
  )
}
