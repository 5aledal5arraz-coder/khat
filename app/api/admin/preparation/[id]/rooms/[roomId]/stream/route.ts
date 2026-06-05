import { NextRequest } from "next/server"
import { getAdminAuthUser } from "@/lib/api-utils"
import { getRoomSnapshot } from "@/lib/collaboration/rooms"
import { subscribe } from "@/lib/collaboration/broadcast"

export const dynamic = "force-dynamic"
export const maxDuration = 300 // 5 minutes max for SSE

/**
 * GET — Server-Sent Events stream for a collaboration room.
 *
 * On connect:
 * 1. Auth check
 * 2. Send full room snapshot as first event
 * 3. Keep connection open; broadcast module pushes events
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; roomId: string }> }
) {
  const user = await getAdminAuthUser()
  if (!user) {
    return new Response("Unauthorized", { status: 401 })
  }

  const { roomId } = await params

  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>()
  const writer = writable.getWriter()
  const encoder = new TextEncoder()

  // Send initial snapshot
  const snapshot = await getRoomSnapshot(roomId)
  if (!snapshot) {
    writer.close()
    return new Response("Room not found", { status: 404 })
  }

  const initialEvent = `data: ${JSON.stringify({
    type: "snapshot",
    data: snapshot,
    timestamp: new Date().toISOString(),
  })}\n\n`
  writer.write(encoder.encode(initialEvent))

  // Subscribe to broadcast
  const unsubscribe = subscribe(roomId, writer)

  // Send keepalive every 30s
  const keepalive = setInterval(() => {
    writer.write(encoder.encode(": keepalive\n\n")).catch(() => {
      clearInterval(keepalive)
      unsubscribe()
    })
  }, 30_000)

  // Clean up when client disconnects
  _req.signal.addEventListener("abort", () => {
    clearInterval(keepalive)
    unsubscribe()
    writer.close().catch(() => {})
  })

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  })
}
