/** Meeting tracking — scheduled calls / videos / in-person, with outcomes. */

import { and, desc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { partnerMeetings } from "@/lib/db/schema/partnership-crm"
import type { PartnerMeeting, PartnerMeetingStatus, PartnerMeetingType } from "@/types/database"
import { logActivity } from "./activities"

export interface CreateMeetingInput {
  title: string
  type?: PartnerMeetingType | string
  scheduled_at?: string | null
  duration_minutes?: number | null
  attendees?: string | null
  agenda?: string | null
  notes?: string | null
  outcome?: string | null
  status?: PartnerMeetingStatus
  created_by?: string | null
}

export async function getMeetings(leadId: string): Promise<PartnerMeeting[]> {
  if (!db) return []
  const rows = await db
    .select()
    .from(partnerMeetings)
    .where(eq(partnerMeetings.lead_id, leadId))
    .orderBy(desc(partnerMeetings.scheduled_at), desc(partnerMeetings.created_at))
  return rows.map(rowToMeeting)
}

export async function createMeeting(
  leadId: string,
  input: CreateMeetingInput,
): Promise<PartnerMeeting | null> {
  if (!db) return null
  const [row] = await db
    .insert(partnerMeetings)
    .values({
      lead_id: leadId,
      title: input.title,
      type: input.type ?? "call",
      scheduled_at: input.scheduled_at ? new Date(input.scheduled_at) : null,
      duration_minutes: input.duration_minutes ?? null,
      attendees: input.attendees ?? null,
      agenda: input.agenda ?? null,
      notes: input.notes ?? null,
      outcome: input.outcome ?? null,
      status: input.status ?? "scheduled",
      created_by: input.created_by ?? null,
    })
    .returning()
  await logActivity(leadId, {
    type: "meeting_logged",
    summary: `سُجّل اجتماع: ${input.title}`,
    actor: input.created_by ?? null,
    metadata: { meeting_id: row.id },
  })
  return rowToMeeting(row)
}

export async function updateMeeting(
  leadId: string,
  meetingId: string,
  patch: Partial<CreateMeetingInput>,
): Promise<void> {
  if (!db) return
  const set: Partial<typeof partnerMeetings.$inferInsert> = {}
  if (patch.title !== undefined) set.title = patch.title
  if (patch.type !== undefined) set.type = patch.type
  if (patch.scheduled_at !== undefined) set.scheduled_at = patch.scheduled_at ? new Date(patch.scheduled_at) : null
  if (patch.duration_minutes !== undefined) set.duration_minutes = patch.duration_minutes
  if (patch.attendees !== undefined) set.attendees = patch.attendees
  if (patch.agenda !== undefined) set.agenda = patch.agenda
  if (patch.notes !== undefined) set.notes = patch.notes
  if (patch.outcome !== undefined) set.outcome = patch.outcome
  if (patch.status !== undefined) set.status = patch.status
  if (Object.keys(set).length === 0) return
  await db
    .update(partnerMeetings)
    .set(set)
    .where(and(eq(partnerMeetings.id, meetingId), eq(partnerMeetings.lead_id, leadId)))
}

export async function deleteMeeting(leadId: string, meetingId: string): Promise<void> {
  if (!db) return
  await db
    .delete(partnerMeetings)
    .where(and(eq(partnerMeetings.id, meetingId), eq(partnerMeetings.lead_id, leadId)))
}

function rowToMeeting(r: typeof partnerMeetings.$inferSelect): PartnerMeeting {
  return {
    id: r.id,
    lead_id: r.lead_id,
    title: r.title,
    type: r.type,
    scheduled_at: r.scheduled_at ? r.scheduled_at.toISOString() : null,
    duration_minutes: r.duration_minutes ?? null,
    attendees: r.attendees ?? null,
    agenda: r.agenda ?? null,
    notes: r.notes ?? null,
    outcome: r.outcome ?? null,
    status: r.status as PartnerMeetingStatus,
    created_by: r.created_by ?? null,
    created_at: (r.created_at ?? new Date()).toISOString(),
  }
}
