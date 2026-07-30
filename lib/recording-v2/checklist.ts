/**
 * Pre-shoot checklist — persistence.
 *
 * Thin DB layer over `recording_checklist_items`. All flow/derivation logic
 * lives in the pure `preflight-checklist.ts`; this module only reads and writes
 * rows, so the rules stay testable without a database.
 *
 * State is in Postgres, never in memory: the SSE bus lives on `globalThis`
 * (`lib/collaboration/broadcast.ts`) and a PM2 restart wipes every subscription,
 * so an in-memory checklist would silently reset mid-setup.
 */

import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  collaborationRooms,
  recordingChecklistItems,
} from "@/lib/db/schema/collaboration"
import {
  MAX_NA_REASON_LENGTH,
  isChecklistItemKey,
  type ChecklistEntry,
} from "./preflight-checklist"

/** Persisted rows for one take, in catalogue-agnostic form. */
export async function getChecklistEntries(
  roomId: string,
  takeNumber: number,
): Promise<ChecklistEntry[]> {
  const rows = await db!
    .select({
      item_key: recordingChecklistItems.item_key,
      checked_at: recordingChecklistItems.checked_at,
      checked_by: recordingChecklistItems.checked_by,
      not_applicable_reason: recordingChecklistItems.not_applicable_reason,
    })
    .from(recordingChecklistItems)
    .where(
      and(
        eq(recordingChecklistItems.room_id, roomId),
        eq(recordingChecklistItems.take_number, takeNumber),
      ),
    )
  return rows.map((r) => ({
    item_key: r.item_key,
    checked_at: r.checked_at ? r.checked_at.toISOString() : null,
    checked_by: r.checked_by,
    not_applicable_reason: r.not_applicable_reason,
  }))
}

/** The room's current take — checklist state is always scoped to it. */
export async function getCurrentTakeNumber(roomId: string): Promise<number | null> {
  const [room] = await db!
    .select({ take_number: collaborationRooms.take_number })
    .from(collaborationRooms)
    .where(eq(collaborationRooms.id, roomId))
    .limit(1)
  return room?.take_number ?? null
}

export type ChecklistWriteResult =
  | { ok: true; entries: ChecklistEntry[]; takeNumber: number }
  | { ok: false; error: string }

/**
 * Confirm an item, waive it with a reason, or clear it back to pending.
 *
 * One upsert on the (room_id, take_number, item_key) unique key, so two
 * operators tapping the same row cannot create duplicates.
 *
 * `actorId` is the ADMIN USER id from the session — never a
 * `room_participants.id`, and no decision here reads `room_participants.role`:
 * `ensureParticipant` hardcodes `role: "director"` for anyone who writes a
 * marker, so that column is provably unreliable. Session identity is not.
 */
export async function setChecklistItem(input: {
  roomId: string
  itemKey: string
  actorId: string | null
  /** "done" | "not_applicable" | "pending" */
  state: "done" | "not_applicable" | "pending"
  notApplicableReason?: string | null
}): Promise<ChecklistWriteResult> {
  if (!isChecklistItemKey(input.itemKey)) {
    return { ok: false, error: "unknown_item" }
  }
  const takeNumber = await getCurrentTakeNumber(input.roomId)
  if (takeNumber == null) return { ok: false, error: "room_not_found" }

  // A waiver without a reason is just an unexplained skip, which is the thing
  // the gate exists to prevent.
  let reason: string | null = null
  if (input.state === "not_applicable") {
    reason = (input.notApplicableReason ?? "").trim().slice(0, MAX_NA_REASON_LENGTH)
    if (!reason) return { ok: false, error: "reason_required" }
  }

  const now = new Date()
  const values = {
    room_id: input.roomId,
    take_number: takeNumber,
    item_key: input.itemKey,
    checked_at: input.state === "done" ? now : null,
    checked_by: input.state === "pending" ? null : input.actorId,
    not_applicable_reason: reason,
    updated_at: now,
  }

  await db!
    .insert(recordingChecklistItems)
    .values(values)
    .onConflictDoUpdate({
      target: [
        recordingChecklistItems.room_id,
        recordingChecklistItems.take_number,
        recordingChecklistItems.item_key,
      ],
      set: {
        checked_at: values.checked_at,
        checked_by: values.checked_by,
        not_applicable_reason: values.not_applicable_reason,
        updated_at: now,
      },
    })

  const entries = await getChecklistEntries(input.roomId, takeNumber)
  return { ok: true, entries, takeNumber }
}
