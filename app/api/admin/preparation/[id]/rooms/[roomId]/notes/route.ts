import { NextRequest, NextResponse } from "next/server"
import { requireRole, errorResponse, validationErrorResponse } from "@/lib/api-utils"
import { createNote, markNoteSeen, resolveNote } from "@/lib/collaboration/rooms"
import { requireRoomRole, ROOM_ACTION_ROLES } from "@/lib/collaboration/permissions"
import { broadcast } from "@/lib/collaboration/broadcast"

/** POST — create a new note (any participant) */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; roomId: string }> }
) {
  const auth = await requireRole("VIEWER")
  if (auth.error) return auth.error

  const { roomId } = await params

  try {
    const body = await req.json()

    if (!body.content || typeof body.content !== "string") {
      return validationErrorResponse("المحتوى مطلوب")
    }
    // Notes attach to an interview card (V1) or a prep_v2 section (V2);
    // both absent ⇒ a room-global note. card_id/section_key are optional.

    // Verify user is a participant (any role)
    const roomAuth = await requireRoomRole(roomId, auth.user.id, ROOM_ACTION_ROLES.add_note)
    if (roomAuth.error !== null) return errorResponse(roomAuth.error, 403)

    const note = await createNote(roomId, roomAuth.participant.id, {
      card_id: typeof body.card_id === "string" ? body.card_id : undefined,
      section_key: typeof body.section_key === "string" ? body.section_key : undefined,
      content: body.content.trim().slice(0, 1000),
      note_type: body.note_type,
      priority: body.priority,
    })

    broadcast(roomId, { type: "note_added", data: note, timestamp: new Date().toISOString() })
    return NextResponse.json(note, { status: 201 })
  } catch {
    return errorResponse("فشل في إضافة الملاحظة", 500)
  }
}

/** PATCH — mark note as seen (host only) or resolved (director+) */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; roomId: string }> }
) {
  const auth = await requireRole("EDITOR")
  if (auth.error) return auth.error

  const { roomId } = await params

  try {
    const body = await req.json()

    if (!body.note_id || typeof body.note_id !== "string") {
      return validationErrorResponse("note_id مطلوب")
    }

    if (body.action === "seen") {
      const roomAuth = await requireRoomRole(roomId, auth.user.id, ROOM_ACTION_ROLES.mark_note_seen)
      if (roomAuth.error !== null) return errorResponse(roomAuth.error, 403)

      await markNoteSeen(body.note_id)
      broadcast(roomId, {
        type: "note_seen",
        data: { id: body.note_id },
        timestamp: new Date().toISOString(),
      })
    } else if (body.action === "resolve") {
      const roomAuth = await requireRoomRole(roomId, auth.user.id, ROOM_ACTION_ROLES.resolve_note)
      if (roomAuth.error !== null) return errorResponse(roomAuth.error, 403)

      await resolveNote(body.note_id)
      broadcast(roomId, {
        type: "note_seen",
        data: { id: body.note_id, resolved: true },
        timestamp: new Date().toISOString(),
      })
    } else {
      return validationErrorResponse("action يجب أن يكون seen أو resolve")
    }

    return NextResponse.json({ success: true })
  } catch {
    return errorResponse("فشل في تحديث الملاحظة", 500)
  }
}
