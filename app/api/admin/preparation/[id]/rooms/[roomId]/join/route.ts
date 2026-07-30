import { NextRequest, NextResponse } from "next/server"
import { requireRole, errorResponse, validationErrorResponse } from "@/lib/api-utils"
import { joinRoom, leaveRoom, heartbeat, sweepStaleParticipants } from "@/lib/collaboration/rooms"
import { broadcast } from "@/lib/collaboration/broadcast"
// Shared with the recording page's server render, which resolves the same role
// up front so a director is never handed the host cockpit while the SSE
// participant list is still in flight. See lib/collaboration/room-roles.ts.
import { resolveRoomRole } from "@/lib/collaboration/room-roles"
import { resolveMemberName } from "@/lib/admin/team-identity"

/**
 * POST — join a room. BOTH the name and the role are server-assigned from the
 * admin identity; the request body is ignored entirely (see below).
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; roomId: string }> }
) {
  const auth = await requireRole("VIEWER")
  if (auth.error) return auth.error

  const { roomId } = await params

  try {
    /**
     * The display name is SERVER-DERIVED. The request body is not consulted.
     *
     * This used to be `body.display_name?.trim() || resolveMemberName(...)`,
     * unvalidated and unbounded — and `joinRoom` writes display_name over the
     * stored value on EVERY join. Since this route only requires VIEWER, any
     * admin account could join as «خالد» and have its markers attributed to him
     * in the file the external editor receives. There is no legitimate reason
     * for a client to name itself: the session already tells us who this is.
     */
    const displayName = resolveMemberName(auth.user)
    const role = resolveRoomRole({
      jobTitle: auth.user.job_title,
      adminRole: auth.user.role,
    })

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
