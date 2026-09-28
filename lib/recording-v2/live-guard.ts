/**
 * Is a take running on this preparation right now?
 *
 * Used to REFUSE a full prep_v2 regeneration while a room on the prep is live
 * or paused. A regeneration replaces the whole question bank — new ids, new
 * sections — and the host's cockpit follows `prep_update` live, so the screen
 * he is reading from would be swapped wholesale mid-take, and the questions
 * already marked asked would point at ids that no longer exist.
 *
 * Single-question edits are NOT refused: they keep ids, and the cockpit names
 * an edit to the question on screen instead of swapping it silently.
 */

import { and, eq, inArray } from "drizzle-orm"
import { db } from "@/lib/db"
import { collaborationRooms } from "@/lib/db/schema/collaboration"

export const ROOM_LIVE_REGENERATION_MESSAGE =
  "فيه تسجيل شغّال على هذا الإعداد الآن (مباشر أو متوقّف مؤقتاً) — أنهِ التسجيل أولاً ثم أعد توليد الإعداد."

export async function hasActiveRecordingForPreparation(preparationId: string): Promise<boolean> {
  if (!db) return false
  const [row] = await db
    .select({ id: collaborationRooms.id })
    .from(collaborationRooms)
    .where(
      and(
        eq(collaborationRooms.preparation_id, preparationId),
        inArray(collaborationRooms.status, ["live", "paused"]),
      ),
    )
    .limit(1)
  return Boolean(row)
}
