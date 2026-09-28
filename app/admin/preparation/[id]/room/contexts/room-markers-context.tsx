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

/** A marker request the server refused. `status` 401 = the session is gone. */
export class MarkerRequestError extends Error {
  constructor(public status: number) {
    super(`marker request failed: ${status}`)
    this.name = "MarkerRequestError"
  }
}

/** Arabic copy for a failed marker request — what to DO, not the status code. */
export function markerErrorMessage(err: unknown): string {
  if (err instanceof MarkerRequestError && err.status === 401) {
    return "انتهت الجلسة — سجّل الدخول من جديد."
  }
  if (err instanceof MarkerRequestError && err.status === 403) {
    return "ما عندك صلاحية لهذا في الغرفة."
  }
  return "ما وصلت — تأكّد من الاتصال وأعد المحاولة."
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
          setMarkers((prev) => [...prev, m].sort((a, b) => a.net_recording_ms - b.net_recording_ms))
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

  /**
   * Both calls THROW on a non-2xx now. They used to ignore the response, so a
   * 403 (no room permission) or a 401 (session expired) looked exactly like
   * success: the button settled, nothing appeared, nothing said why. The error
   * carries the status so a caller can tell "sign in again" from "try again".
   */
  const addMarkerAction = useCallback(
    async (type: SessionMarkerType, label: string, note?: string) => {
      const res = await fetch(apiBase, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-requested-with": "khat" },
        body: JSON.stringify({ marker_type: type, label, note }),
      })
      if (!res.ok) throw new MarkerRequestError(res.status)
    },
    [apiBase],
  )

  const deleteMarkerAction = useCallback(
    async (id: string) => {
      const res = await fetch(apiBase, {
        method: "DELETE",
        headers: { "Content-Type": "application/json", "x-requested-with": "khat" },
        body: JSON.stringify({ marker_id: id }),
      })
      if (!res.ok) throw new MarkerRequestError(res.status)
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
