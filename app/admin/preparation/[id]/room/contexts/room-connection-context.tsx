"use client"

/**
 * RoomConnectionContext — SSE lifecycle manager.
 *
 * Responsibilities:
 *   1. Open EventSource on mount, close on unmount
 *   2. Parse incoming SSE events and dispatch to subscribers
 *   3. Auto-reconnect with exponential backoff on drop
 *   4. Track connection status (connecting / connected / reconnecting / disconnected)
 *   5. Provide initial snapshot to downstream contexts
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react"
import type {
  CollaborationRoomSnapshot,
  RoomEvent,
  RoomEventType,
} from "@/types/collaboration"

// ─── Types ──────────────────────────────────────────────────────────

export type ConnectionStatus = "connecting" | "connected" | "reconnecting" | "disconnected"

type EventHandler = (event: RoomEvent) => void

interface RoomConnectionContextValue {
  status: ConnectionStatus
  snapshot: CollaborationRoomSnapshot | null
  subscribe: (handler: EventHandler) => () => void
  disconnect: () => void
}

// ─── Context ────────────────────────────────────────────────────────

const RoomConnectionContext = createContext<RoomConnectionContextValue | null>(null)

export function useRoomConnection() {
  const ctx = useContext(RoomConnectionContext)
  if (!ctx) throw new Error("useRoomConnection must be used within RoomConnectionProvider")
  return ctx
}

// ─── Provider ───────────────────────────────────────────────────────

const MAX_RETRIES = 5
const BASE_DELAY_MS = 1000

export function RoomConnectionProvider({
  prepId,
  roomId,
  children,
}: {
  prepId: string
  roomId: string
  children: ReactNode
}) {
  const [status, setStatus] = useState<ConnectionStatus>("connecting")
  const [snapshot, setSnapshot] = useState<CollaborationRoomSnapshot | null>(null)

  const handlersRef = useRef<Set<EventHandler>>(new Set())
  const eventSourceRef = useRef<EventSource | null>(null)
  const retriesRef = useRef(0)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef = useRef(true)

  // ── Dispatch event to all subscribers ────────────────────────────

  const dispatch = useCallback((event: RoomEvent) => {
    for (const handler of handlersRef.current) {
      try {
        handler(event)
      } catch {
        // Subscriber error should not break dispatch loop
      }
    }
  }, [])

  // ── Connect to SSE ──────────────────────────────────────────────

  const connect = useCallback(() => {
    if (!mountedRef.current) return

    // Close existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }

    const url = `/api/admin/preparation/${prepId}/rooms/${roomId}/stream`
    const es = new EventSource(url)
    eventSourceRef.current = es

    es.onopen = () => {
      if (!mountedRef.current) return
      setStatus("connected")
      retriesRef.current = 0
    }

    es.onmessage = (msg) => {
      if (!mountedRef.current) return
      try {
        const event: RoomEvent = JSON.parse(msg.data)

        // First event is always the snapshot
        if (event.type === "snapshot") {
          setSnapshot(event.data as CollaborationRoomSnapshot)
        }

        dispatch(event)
      } catch {
        // Malformed SSE data — skip
      }
    }

    es.onerror = () => {
      if (!mountedRef.current) return
      es.close()
      eventSourceRef.current = null

      if (retriesRef.current >= MAX_RETRIES) {
        setStatus("disconnected")
        return
      }

      setStatus("reconnecting")
      const delay = BASE_DELAY_MS * Math.pow(2, retriesRef.current)
      retriesRef.current++

      reconnectTimerRef.current = setTimeout(() => {
        if (mountedRef.current) connect()
      }, delay)
    }
  }, [prepId, roomId, dispatch])

  // ── Lifecycle ───────────────────────────────────────────────────

  useEffect(() => {
    mountedRef.current = true
    connect()

    return () => {
      mountedRef.current = false
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
      }
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current)
      }
    }
  }, [connect])

  // ── Public API ──────────────────────────────────────────────────

  const subscribe = useCallback((handler: EventHandler) => {
    handlersRef.current.add(handler)
    return () => { handlersRef.current.delete(handler) }
  }, [])

  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current)
    }
    setStatus("disconnected")
  }, [])

  return (
    <RoomConnectionContext.Provider value={{ status, snapshot, subscribe, disconnect }}>
      {children}
    </RoomConnectionContext.Provider>
  )
}
