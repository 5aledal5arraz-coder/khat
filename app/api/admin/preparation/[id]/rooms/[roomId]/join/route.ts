import { NextRequest, NextResponse } from "next/server"
import { requireRole, errorResponse, validationErrorResponse } from "@/lib/api-utils"
import { joinRoom, leaveRoom, heartbeat, sweepStaleParticipants } from "@/lib/collaboration/rooms"
import { broadcast } from "@/lib/collaboration/broadcast"
import type { AdminRole } from "@/lib/admin/auth"
import type { ParticipantRole } from "@/types/collaboration"

/**
 * Deterministic room-role assignment from admin identity.
 * No client self-selection — the server always decides.
 *
 *   OWNER  → host
 *   ADMIN  → director
 *   EDITOR → editor
 *   VIEWER → viewer
 *
 * On rejoin (existing participant record), the role is re-derived
 * from the current admin identity — always authoritative.
 */
function adminRoleToRoomRole(adminRole: AdminRole): ParticipantRole {
  switch (adminRole) {
    case "OWNER": return "host"
    case "ADMIN": return "director"
    case "EDITOR": return "editor"
    case "VIEWER": return "viewer"
  }
}

/** POST — join a room (role is server-assigned from admin identity) */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; roomId: string }> }
) {
  const auth = await requireRole("VIEWER")
  if (auth.error) return auth.error

  const { roomId } = await params

  try {
    const body = await req.json().catch(() => ({}))
    const displayName = body.display_name?.trim() || auth.user.email.split("@")[0]
    const role = adminRoleToRoomRole(auth.user.role)

    const participant = await joinRoom(
      roomId,
      auth.user.id,
      displayName,
      role,
    )

    broadcast(roomId, {
      type: "participant_update",
      data: participant,
      timestamp: new Date().toISOString(),
    })

    return NextResponse.json(participant)
  } catch {
    return errorResponse("فشل في الانضمام إلى الغرفة", 500)
  }
}

/** DELETE — leave a room (body: { participant_id }) */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; roomId: string }> }
) {
  const auth = await requireRole("VIEWER")
  if (auth.error) return auth.error

  const { roomId } = await params

  try {
    const body = await req.json()
    if (!body.participant_id) return validationErrorResponse("participant_id مطلوب")

    await leaveRoom(body.participant_id)

    broadcast(roomId, {
      type: "participant_update",
      data: { id: body.participant_id, is_online: false },
      timestamp: new Date().toISOString(),
    })

    return NextResponse.json({ success: true })
  } catch {
    return errorResponse("فشل في مغادرة الغرفة", 500)
  }
}

/** PATCH — heartbeat + stale participant sweep */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; roomId: string }> }
) {
  const auth = await requireRole("VIEWER")
  if (auth.error) return auth.error

  const { roomId } = await params

  try {
    const body = await req.json()
    if (!body.participant_id) return validationErrorResponse("participant_id مطلوب")

    await heartbeat(body.participant_id)

    // Piggyback: sweep stale participants (>90s since last heartbeat)
    const staleIds = await sweepStaleParticipants(roomId)
    for (const id of staleIds) {
      broadcast(roomId, {
        type: "participant_update",
        data: { id, is_online: false },
        timestamp: new Date().toISOString(),
      })
    }

    return NextResponse.json({ success: true })
  } catch {
    return errorResponse("فشل في تحديث النبض", 500)
  }
}
