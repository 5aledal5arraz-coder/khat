/**
 * prep_v2 → live room push.
 *
 * A live recording room is created (and its link shared with the team)
 * BEFORE the prep_v2 pipeline finishes — generation takes minutes. Without
 * a push, everyone already sitting in the room keeps rendering the copy
 * their page was server-rendered with, which is `null`, forever.
 *
 * The two sides are complementary, and both are needed:
 *   • pull — `getRoomSnapshot()` re-reads prep_v2 on every SSE connect, so
 *     anyone who opens or reconnects AFTER the write gets it.
 *   • push — this module, so anyone who was already connected BEFORE the
 *     write gets it too, instead of waiting for a drop that may never come
 *     (an idle SSE stream can stay open for the whole recording).
 *
 * Best-effort by construction: the bus is in-process, so this reaches only
 * clients whose SSE stream is served by the process that wrote the payload.
 * Today every prep_v2 write happens in the Next process (server action /
 * season conversion), so that holds; if generation ever moves to the job
 * worker, the pull side still covers reconnects.
 */

import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { collaborationRooms } from "@/lib/db/schema"
import { broadcast } from "./broadcast"
import type { PrepV2Payload } from "@/lib/preparation/v2/types"

/**
 * Broadcast a `prep_update` to every room attached to `preparationId`.
 * Returns the room ids notified (diagnostic / tests).
 */
export async function broadcastPrepV2Update(
  preparationId: string,
  payload: PrepV2Payload,
): Promise<string[]> {
  if (!db) return []

  const rooms = await db
    .select({ id: collaborationRooms.id })
    .from(collaborationRooms)
    .where(eq(collaborationRooms.preparation_id, preparationId))

  const timestamp = new Date().toISOString()
  for (const room of rooms) {
    broadcast(room.id, { type: "prep_update", data: payload, timestamp })
  }

  return rooms.map((r) => r.id)
}
