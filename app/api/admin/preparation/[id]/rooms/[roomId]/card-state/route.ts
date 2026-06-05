import { NextRequest, NextResponse } from "next/server"
import { requireRole, errorResponse, validationErrorResponse } from "@/lib/api-utils"
import { updateCardState, pinCardInRoom, updateRoom, getRoomById } from "@/lib/collaboration/rooms"
import { requireRoomRole, ROOM_ACTION_ROLES } from "@/lib/collaboration/permissions"
import { broadcast } from "@/lib/collaboration/broadcast"
import type { RoomCardStatus } from "@/types/collaboration"

const VALID_STATUSES: RoomCardStatus[] = ["pending", "active", "used", "skipped"]

/** PATCH — update card state in a room */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; roomId: string }> }
) {
  const auth = await requireRole("EDITOR")
  if (auth.error) return auth.error

  const { roomId } = await params

  try {
    const body = await req.json()

    if (!body.card_id || typeof body.card_id !== "string") {
      return validationErrorResponse("card_id مطلوب")
    }

    // Pin toggle — requires director+
    if (body.is_pinned !== undefined) {
      const roomAuth = await requireRoomRole(roomId, auth.user.id, ROOM_ACTION_ROLES.pin_card)
      if (roomAuth.error) return errorResponse(roomAuth.error, 403)

      const state = await pinCardInRoom(roomId, body.card_id, !!body.is_pinned)
      broadcast(roomId, { type: "card_pinned", data: state, timestamp: new Date().toISOString() })
      return NextResponse.json(state)
    }

    // Status update — requires director+
    if (!body.status || !VALID_STATUSES.includes(body.status)) {
      return validationErrorResponse("حالة البطاقة غير صالحة")
    }

    const roomAuth = await requireRoomRole(roomId, auth.user.id, ROOM_ACTION_ROLES.mark_card_used)
    if (roomAuth.error) return errorResponse(roomAuth.error, 403)

    const state = await updateCardState(roomId, body.card_id, body.status)
    broadcast(roomId, { type: "card_state_update", data: state, timestamp: new Date().toISOString() })

    // ── Sync room.active_card_id to match card state ──────────
    // This keeps the room column consistent with card states so
    // snapshots on reconnect show the correct active card.
    if (body.status === "active") {
      const room = await updateRoom(roomId, { active_card_id: body.card_id })
      if (room) {
        broadcast(roomId, { type: "room_update", data: room, timestamp: new Date().toISOString() })
      }
    } else if (body.status === "used" || body.status === "skipped") {
      // Only clear active_card_id if this card IS the current active card.
      // Skipping a non-active pending card must not disrupt the active card.
      const currentRoom = await getRoomById(roomId)
      if (currentRoom && currentRoom.active_card_id === body.card_id) {
        const room = await updateRoom(roomId, { active_card_id: null })
        if (room) {
          broadcast(roomId, { type: "room_update", data: room, timestamp: new Date().toISOString() })
        }
      }
    }

    return NextResponse.json(state)
  } catch {
    return errorResponse("فشل في تحديث حالة البطاقة", 500)
  }
}
