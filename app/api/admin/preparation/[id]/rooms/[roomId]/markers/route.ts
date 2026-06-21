import { NextRequest, NextResponse } from "next/server"
import { requireRole, errorResponse } from "@/lib/api-utils"
import { createMarker, deleteMarker, getMarkersByRoom } from "@/lib/collaboration/rooms"
import { requireRoomRole, ROOM_ACTION_ROLES } from "@/lib/collaboration/permissions"
import { broadcast } from "@/lib/collaboration/broadcast"
import { isQuickMarkerType } from "@/lib/recording-v2/marker-types"

/** GET — list all markers for a room */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; roomId: string }> }
) {
  const auth = await requireRole("VIEWER")
  if (auth.error) return auth.error

  const { roomId } = await params

  try {
    const markers = await getMarkersByRoom(roomId)
    return NextResponse.json(markers)
  } catch {
    return errorResponse("فشل في جلب العلامات", 500)
  }
}

/** POST — add a session marker */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; roomId: string }> }
) {
  const auth = await requireRole("EDITOR")
  if (auth.error) return auth.error

  const { roomId } = await params

  try {
    const roomAuth = await requireRoomRole(roomId, auth.user.id, ROOM_ACTION_ROLES.add_marker)
    if (roomAuth.error) return errorResponse(roomAuth.error, 403)

    const body = await req.json()

    if (!body.marker_type || typeof body.marker_type !== "string" || !isQuickMarkerType(body.marker_type)) {
      return errorResponse("نوع العلامة غير صالح", 422)
    }
    if (!body.label || typeof body.label !== "string") {
      return errorResponse("العنوان مطلوب", 422)
    }

    const participantId = "participant" in roomAuth ? roomAuth.participant.id : ""
    const marker = await createMarker(roomId, participantId, {
      marker_type: body.marker_type,
      label: body.label,
      note: body.note,
    })

    broadcast(roomId, {
      type: "marker_added",
      data: marker,
      timestamp: new Date().toISOString(),
    })

    return NextResponse.json(marker, { status: 201 })
  } catch {
    return errorResponse("فشل في إضافة العلامة", 500)
  }
}

/** DELETE — remove a session marker */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; roomId: string }> }
) {
  const auth = await requireRole("EDITOR")
  if (auth.error) return auth.error

  const { roomId } = await params

  try {
    const roomAuth = await requireRoomRole(roomId, auth.user.id, ROOM_ACTION_ROLES.delete_marker)
    if (roomAuth.error) return errorResponse(roomAuth.error, 403)

    const body = await req.json()
    if (!body.marker_id) return errorResponse("معرّف العلامة مطلوب", 422)

    await deleteMarker(body.marker_id)

    broadcast(roomId, {
      type: "marker_deleted",
      data: { id: body.marker_id },
      timestamp: new Date().toISOString(),
    })

    return NextResponse.json({ ok: true })
  } catch {
    return errorResponse("فشل في حذف العلامة", 500)
  }
}
