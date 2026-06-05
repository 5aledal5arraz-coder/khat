/**
 * Room-level permission enforcement.
 *
 * Maps each room action to the minimum participant role required.
 * Role hierarchy: host > director > photographer > editor > viewer
 */

import { db } from "@/lib/db"
import { roomParticipants } from "@/lib/db/schema"
import { eq, and } from "drizzle-orm"
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
 */
export async function requireRoomRole(
  roomId: string,
  userId: string,
  minimumRole: ParticipantRole,
): Promise<{ error: string } | { error: null; participant: { id: string; role: ParticipantRole } }> {
  const p = await getParticipant(roomId, userId)
  if (!p) return { error: "لست مشاركاً في هذه الغرفة" }

  const role = p.role as ParticipantRole
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
  change_energy: "host" as ParticipantRole,
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
