import { NextRequest, NextResponse } from "next/server"
import { requireRole, errorResponse } from "@/lib/api-utils"
import { requireRoomRole, ROOM_ACTION_ROLES } from "@/lib/collaboration/permissions"
import { broadcast } from "@/lib/collaboration/broadcast"
import { recordEnergyDecisionMarker } from "@/lib/collaboration/rooms"
import type { EnergyDecisionKind } from "@/types/collaboration"

const VALID_DECISIONS: EnergyDecisionKind[] = [
  "approved",
  "expired",
  "overridden",
  "unmuted",
]

/**
 * POST — record and announce what the host did with the director's energy cue.
 *
 * Two effects, both required:
 *   1. a broadcast, so the director's status line stops lying to him. Without
 *      it he taps the dial, sees the number move, and has no way to tell "not
 *      seen" from "seen and refused" — so he taps again, and again.
 *   2. an `energy_change` marker, so the decision survives the take. A session
 *      whose log holds six dial moves and zero decisions cannot answer "did the
 *      dial change anything?" after the fact — which is the exact question this
 *      whole feature was opened to settle.
 *
 * The marker is best-effort and never blocks the response: losing a status line
 * to a failed insert would trade the smaller loss for the bigger one.
 *
 * Gated at `change_energy` (director+, from `admin_users.role`) rather than
 * `change_phase`: the room role is a view selector, and the host account is
 * routinely an ADMIN — which `adminRoleToRoomRole` maps to "director". A
 * host-only gate here would reject the very person the route is for.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; roomId: string }> },
) {
  const auth = await requireRole("EDITOR")
  if (auth.error) return auth.error

  const { roomId } = await params

  try {
    const roomAuth = await requireRoomRole(roomId, auth.user.id, ROOM_ACTION_ROLES.change_energy)
    if (roomAuth.error) return errorResponse(roomAuth.error, 403)

    const body = await req.json()
    const decision = body?.decision as EnergyDecisionKind
    if (!VALID_DECISIONS.includes(decision)) {
      return errorResponse("قرار غير صالح", 422)
    }
    const level = Math.round(Number(body?.level))
    if (!Number.isFinite(level) || level < 0 || level > 5) {
      return errorResponse("مستوى الطاقة يجب أن يكون بين 0 و 5", 422)
    }
    const approved = Math.round(Number(body?.approved))
    if (!Number.isFinite(approved) || approved < 0 || approved > 5) {
      return errorResponse("مستوى الطاقة يجب أن يكون بين 0 و 5", 422)
    }
    const muted = body?.muted === true

    broadcast(roomId, {
      type: "energy_decision",
      data: { decision, level, approved, muted },
      timestamp: new Date().toISOString(),
    })

    const marker = await recordEnergyDecisionMarker(roomId, auth.user.id, {
      decision,
      level,
      approved,
    })
    if (marker) {
      broadcast(roomId, {
        type: "marker_added",
        data: marker,
        timestamp: new Date().toISOString(),
      })
    }

    return NextResponse.json({ ok: true, marker_id: marker?.id ?? null })
  } catch {
    return errorResponse("فشل في إرسال قرار الطاقة", 500)
  }
}
