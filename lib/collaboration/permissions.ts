/**
 * Room-level permission enforcement.
 *
 * Maps each room action to the minimum participant role required.
 * Role hierarchy: host > director > photographer > editor > viewer
 *
 * ⚠️ The enforced role is derived from `admin_users.role`, NOT read from
 * `room_participants.role`. See `requireRoomRole()` for why that distinction is
 * load-bearing.
 */

import { db } from "@/lib/db"
import { adminUsers, roomParticipants } from "@/lib/db/schema"
import { eq, and } from "drizzle-orm"
import type { AdminRole } from "@/lib/admin/auth"
import { adminRoleToRoomRole } from "@/lib/collaboration/room-roles"
import type { ParticipantRole } from "@/types/collaboration"

const ROLE_RANK: Record<ParticipantRole, number> = {
  host: 5,
  director: 4,
  photographer: 3,
  editor: 2,
  viewer: 1,
}

/** Check if a participant role meets the minimum required role. */
export function hasRoomRole(actual: ParticipantRole, minimum: ParticipantRole): boolean {
  return (ROLE_RANK[actual] ?? 0) >= (ROLE_RANK[minimum] ?? 0)
}

/**
 * Look up the calling user's participant record in a room.
 * Returns null if user is not a participant.
 */
export async function getParticipant(roomId: string, userId: string) {
  const [row] = await db!
    .select()
    .from(roomParticipants)
    .where(and(
      eq(roomParticipants.room_id, roomId),
      eq(roomParticipants.user_id, userId),
    ))
    .limit(1)
  return row ?? null
}

/**
 * Require a minimum room role for an action.
 * Returns { error: string } if denied, or { participant } if allowed.
 *
 * ⚠️ THE ENFORCED ROLE IS DERIVED FROM `admin_users.role`, NEVER READ FROM
 * `room_participants.role`.
 *
 * This is a real authorization gate — `delete_marker`, `end_room`,
 * `change_phase` and `edit_host_notes` all hang off it. `room_participants.role`
 * must not feed it, because that column is now a projection of
 * `admin_users.job_title` (the member's صفحة), a DESCRIPTIVE field edited from
 * /admin/team. If this function read it, giving the مخرج his صفحة on a limited
 * EDITOR account would silently promote him from rank 2 to rank 4 and hand him
 * marker deletion — a label change granting a permission.
 *
 * So the two stay split, and the split is total:
 *   - `admin_users.role`        → what you may DO (here, and requireActionRole)
 *   - `admin_users.job_title`   → which screen you SEE + how you are named
 *   - `room_participants.role`  → presence + display ONLY, never authorization
 *
 * `room_participants` is still consulted for MEMBERSHIP (you must be in the
 * room) and for the participant id callers attribute markers/notes to — just
 * not for the rank. A stale participant row therefore can no longer carry stale
 * permissions, which also closes the `ensureParticipant` gap (it returns an
 * existing row without refreshing its role).
 *
 * Fails closed: no admin record → denied.
 */
export async function requireRoomRole(
  roomId: string,
  userId: string,
  minimumRole: ParticipantRole,
): Promise<{ error: string } | { error: null; participant: { id: string; role: ParticipantRole } }> {
  const p = await getParticipant(roomId, userId)
  if (!p) return { error: "لست مشاركاً في هذه الغرفة" }

  const [admin] = await db!
    .select({ role: adminUsers.role })
    .from(adminUsers)
    .where(eq(adminUsers.id, userId))
    .limit(1)
  if (!admin) return { error: "ليس لديك صلاحية لهذا الإجراء في الغرفة" }

  const role = adminRoleToRoomRole(admin.role as AdminRole)
  if (!hasRoomRole(role, minimumRole)) {
    return { error: "ليس لديك صلاحية لهذا الإجراء في الغرفة" }
  }

  return { error: null, participant: { id: p.id, role } }
}

// ─── Action → minimum role mapping ──────────────────────────────────
// Used by routes to know which role to require for each action.

export const ROOM_ACTION_ROLES = {
  // Room state changes — host only
  change_phase: "host" as ParticipantRole,
  // Energy is the director's primary cue to the host (host can still override).
  change_energy: "director" as ParticipantRole,
  change_active_card: "host" as ParticipantRole,
  edit_host_notes: "host" as ParticipantRole,
  pause_room: "host" as ParticipantRole,
  end_room: "host" as ParticipantRole,

  // Card state — director+
  mark_card_used: "director" as ParticipantRole,
  mark_card_skipped: "director" as ParticipantRole,
  pin_card: "director" as ParticipantRole,

  // Notes — any participant
  add_note: "viewer" as ParticipantRole,

  // Note management — director+
  resolve_note: "director" as ParticipantRole,
  mark_note_seen: "host" as ParticipantRole,

  // Session markers — director+
  add_marker: "director" as ParticipantRole,
  delete_marker: "director" as ParticipantRole,
}
