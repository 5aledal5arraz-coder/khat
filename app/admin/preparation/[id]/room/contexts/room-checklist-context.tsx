"use client"

/**
 * RoomChecklistContext — the pre-shoot checklist, live across both screens.
 *
 * Hydrated from the SSE snapshot, then updated by `checklist_update` events, so
 * the director ticking an item on a tablet unlocks the host's "ابدأ التسجيل" on
 * another device without either of them reloading.
 *
 * Deliberately its OWN slice, not a field on `room`: `room_update` events replace
 * the `room` object wholesale, which would drop the checklist on every energy
 * change or status flip. `prepV2` had to be split out for exactly this reason —
 * see the note in `room-state-context.tsx`.
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react"
import type { ChecklistEntrySnapshot, RoomEvent } from "@/types/collaboration"
import { useRoomConnection } from "./room-connection-context"

interface RoomChecklistContextValue {
  /**
   * Rows the SERVER last reported for the current take, or `null` until the
   * first snapshot lands. `null` is meaningful: callers fall back to their
   * server-rendered copy for the first paint and prefer this afterwards — the
   * same contract as `prepV2`.
   */
  checklist: ChecklistEntrySnapshot[] | null
  /** Take the reported rows belong to, so a re-shoot cannot show stale ticks. */
  takeNumber: number | null
}

const RoomChecklistContext = createContext<RoomChecklistContextValue | null>(null)

export function useRoomChecklist() {
  const ctx = useContext(RoomChecklistContext)
  if (!ctx) {
    throw new Error("useRoomChecklist must be used within RoomChecklistProvider")
  }
  return ctx
}

export function RoomChecklistProvider({ children }: { children: ReactNode }) {
  const { snapshot, subscribe } = useRoomConnection()
  const [checklist, setChecklist] = useState<ChecklistEntrySnapshot[] | null>(null)
  const [takeNumber, setTakeNumber] = useState<number | null>(null)

  // Hydrate on every (re)connect — a reconnect must not leave the host looking
  // at a checklist that emptied itself while the stream was down.
  useEffect(() => {
    if (!snapshot) return
    setChecklist(snapshot.checklist ?? [])
    setTakeNumber(snapshot.take_number ?? null)
  }, [snapshot])

  useEffect(() => {
    const unsub = subscribe((event: RoomEvent) => {
      if (event.type !== "checklist_update") return
      const data = event.data as {
        take_number?: number
        entries?: ChecklistEntrySnapshot[]
      }
      if (Array.isArray(data.entries)) setChecklist(data.entries)
      if (typeof data.take_number === "number") setTakeNumber(data.take_number)
    })
    return unsub
  }, [subscribe])

  return (
    <RoomChecklistContext.Provider value={{ checklist, takeNumber }}>
      {children}
    </RoomChecklistContext.Provider>
  )
}
