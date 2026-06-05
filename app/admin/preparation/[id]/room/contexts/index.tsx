"use client"

/**
 * Room Contexts — composed provider and re-exports.
 *
 * Wraps the five room context layers in the correct dependency order:
 *   Connection → State → Cards → Timer → Markers
 */

import type { ReactNode } from "react"
import { RoomConnectionProvider } from "./room-connection-context"
import { RoomStateProvider } from "./room-state-context"
import { RoomCardsProvider } from "./room-cards-context"
import { RoomTimerProvider } from "./room-timer-context"
import { RoomMarkersProvider } from "./room-markers-context"

// ─── Re-exports ─────────────────────────────────────────────────────

export { useRoomConnection, type ConnectionStatus } from "./room-connection-context"
export { useRoomState } from "./room-state-context"
export { useRoomCards } from "./room-cards-context"
export { useRoomTimer, type TimerStatus } from "./room-timer-context"
export { useRoomMarkers } from "./room-markers-context"

// ─── Composed Provider ──────────────────────────────────────────────

export function RoomProvider({
  prepId,
  roomId,
  children,
}: {
  prepId: string
  roomId: string
  children: ReactNode
}) {
  return (
    <RoomConnectionProvider prepId={prepId} roomId={roomId}>
      <RoomStateProvider prepId={prepId} roomId={roomId}>
        <RoomCardsProvider prepId={prepId} roomId={roomId}>
          <RoomTimerProvider prepId={prepId} roomId={roomId}>
            <RoomMarkersProvider prepId={prepId} roomId={roomId}>
              {children}
            </RoomMarkersProvider>
          </RoomTimerProvider>
        </RoomCardsProvider>
      </RoomStateProvider>
    </RoomConnectionProvider>
  )
}
