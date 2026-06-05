/**
 * In-memory SSE broadcast bus for collaboration rooms.
 *
 * Each room has a Set of connected writable streams.
 * REST mutation routes call broadcast() after writes;
 * the SSE endpoint (/stream) registers writers via subscribe().
 */

import type { RoomEvent } from "@/types/collaboration"

type Writer = WritableStreamDefaultWriter<Uint8Array>

const rooms = new Map<string, Set<Writer>>()
const encoder = new TextEncoder()

/** Subscribe a writer to a room. Returns unsubscribe function. */
export function subscribe(roomId: string, writer: Writer): () => void {
  if (!rooms.has(roomId)) rooms.set(roomId, new Set())
  const set = rooms.get(roomId)!
  set.add(writer)

  return () => {
    set.delete(writer)
    if (set.size === 0) rooms.delete(roomId)
  }
}

/** Broadcast an event to all connected clients in a room. */
export function broadcast(roomId: string, event: RoomEvent): void {
  const set = rooms.get(roomId)
  if (!set || set.size === 0) return

  const data = `data: ${JSON.stringify(event)}\n\n`
  const bytes = encoder.encode(data)

  for (const writer of set) {
    writer.write(bytes).catch(() => {
      // Client disconnected — remove silently
      set.delete(writer)
    })
  }
}

/** Get count of connected clients for a room (diagnostic). */
export function getConnectionCount(roomId: string): number {
  return rooms.get(roomId)?.size ?? 0
}
