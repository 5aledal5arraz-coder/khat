import { NextRequest, NextResponse } from "next/server"
import { requireRole, errorResponse, notFoundResponse } from "@/lib/api-utils"
import { getRoomSnapshot, updateRoom } from "@/lib/collaboration/rooms"
import { requireRoomRole, ROOM_ACTION_ROLES } from "@/lib/collaboration/permissions"
import { broadcast } from "@/lib/collaboration/broadcast"
import type { CollaborationRoomStatus } from "@/types/collaboration"

const VALID_STATUSES: CollaborationRoomStatus[] = ["waiting", "live", "paused", "ended"]

/** GET — full room snapshot (used on initial load / reconnect) */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; roomId: string }> }
) {
  const auth = await requireRole("VIEWER")
  if (auth.error) return auth.error

  const { roomId } = await params

  try {
    const snapshot = await getRoomSnapshot(roomId)
    if (!snapshot) return notFoundResponse()
    return NextResponse.json(snapshot)
  } catch {
    return errorResponse("فشل في جلب بيانات الغرفة", 500)
  }
}

/** PATCH — update room state (status, phase, energy, active card, notes) */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; roomId: string }> }
) {
  const auth = await requireRole("EDITOR")
  if (auth.error) return auth.error

  const { roomId } = await params

  try {
    const body = await req.json()

    // Determine the highest room-role required for the fields being changed
    const hostOnlyFields = ["status", "phase", "energy_level", "active_card_id", "host_notes"]
    const isHostAction = hostOnlyFields.some((f) => body[f] !== undefined)

    if (isHostAction) {
      const roomAuth = await requireRoomRole(roomId, auth.user.id, ROOM_ACTION_ROLES.change_phase)
      if (roomAuth.error) return errorResponse(roomAuth.error, 403)
    }

    // Validate status if provided
    if (body.status && !VALID_STATUSES.includes(body.status)) {
      return errorResponse("حالة غير صالحة", 422)
    }

    // Validate energy_level if provided
    if (body.energy_level !== undefined) {
      const e = Number(body.energy_level)
      if (isNaN(e) || e < 0 || e > 5) {
        return errorResponse("مستوى الطاقة يجب أن يكون بين 0 و 5", 422)
      }
      body.energy_level = e
    }

    const room = await updateRoom(roomId, body)
    if (!room) return notFoundResponse()

    // Broadcast update to all connected clients
    broadcast(roomId, { type: "room_update", data: room, timestamp: new Date().toISOString() })

    return NextResponse.json(room)
  } catch {
    return errorResponse("فشل في تحديث الغرفة", 500)
  }
}
