/**
 * Guest prep meetings — scheduled preparation calls / visits before recording.
 *
 * Mirrors lib/partnership-crm/meetings.ts but scoped to a guest candidate.
 * Pure DB read/write; no coupling to episodes/studio/guests. Manual scheduling
 * only — the admin logs these by hand.
 */

import { and, desc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { guestPrepMeetings } from "@/lib/db/schema/guest-candidates"
import type {
  GuestPrepMeeting,
  GuestPrepMeetingStatus,
  GuestPrepMeetingType,
} from "@/types/database"

export interface CreatePrepMeetingInput {
  title: string
  type?: GuestPrepMeetingType | string
  scheduled_at?: string | null
  duration_minutes?: number | null
  notes?: string | null
  outcome?: string | null
  status?: GuestPrepMeetingStatus
  created_by?: string | null
}

export async function listPrepMeetings(candidateId: string): Promise<GuestPrepMeeting[]> {
  if (!db) return []
  const rows = await db
    .select()
    .from(guestPrepMeetings)
    .where(eq(guestPrepMeetings.candidate_id, candidateId))
    .orderBy(desc(guestPrepMeetings.scheduled_at), desc(guestPrepMeetings.created_at))
  return rows.map(rowToPrepMeeting)
}

export async function createPrepMeeting(
  candidateId: string,
  input: CreatePrepMeetingInput,
): Promise<GuestPrepMeeting | null> {
  if (!db) return null
  const [row] = await db
    .insert(guestPrepMeetings)
    .values({
      candidate_id: candidateId,
      title: input.title,
      type: input.type ?? "video",
      scheduled_at: input.scheduled_at ? new Date(input.scheduled_at) : null,
      duration_minutes: input.duration_minutes ?? null,
      notes: input.notes ?? null,
      outcome: input.outcome ?? null,
      status: input.status ?? "scheduled",
      created_by: input.created_by ?? null,
    })
    .returning()
  return rowToPrepMeeting(row)
}

export async function updatePrepMeeting(
  candidateId: string,
  meetingId: string,
  patch: Partial<CreatePrepMeetingInput>,
): Promise<GuestPrepMeeting | null> {
  if (!db) return null
  const set: Partial<typeof guestPrepMeetings.$inferInsert> = {}
  if (patch.title !== undefined) set.title = patch.title
  if (patch.type !== undefined) set.type = patch.type
  if (patch.scheduled_at !== undefined) set.scheduled_at = patch.scheduled_at ? new Date(patch.scheduled_at) : null
  if (patch.duration_minutes !== undefined) set.duration_minutes = patch.duration_minutes
  if (patch.notes !== undefined) set.notes = patch.notes
  if (patch.outcome !== undefined) set.outcome = patch.outcome
  if (patch.status !== undefined) set.status = patch.status
  if (Object.keys(set).length === 0) return null
  set.updated_at = new Date()
  const [row] = await db
    .update(guestPrepMeetings)
    .set(set)
    .where(and(eq(guestPrepMeetings.id, meetingId), eq(guestPrepMeetings.candidate_id, candidateId)))
    .returning()
  return row ? rowToPrepMeeting(row) : null
}

export async function deletePrepMeeting(candidateId: string, meetingId: string): Promise<void> {
  if (!db) return
  await db
    .delete(guestPrepMeetings)
    .where(and(eq(guestPrepMeetings.id, meetingId), eq(guestPrepMeetings.candidate_id, candidateId)))
}

function rowToPrepMeeting(r: typeof guestPrepMeetings.$inferSelect): GuestPrepMeeting {
  return {
    id: r.id,
    candidate_id: r.candidate_id,
    title: r.title,
    type: r.type,
    scheduled_at: r.scheduled_at ? r.scheduled_at.toISOString() : null,
    duration_minutes: r.duration_minutes ?? null,
    notes: r.notes ?? null,
    outcome: r.outcome ?? null,
    status: r.status as GuestPrepMeetingStatus,
    created_by: r.created_by ?? null,
    created_at: (r.created_at ?? new Date()).toISOString(),
    updated_at: (r.updated_at ?? new Date()).toISOString(),
  }
}
