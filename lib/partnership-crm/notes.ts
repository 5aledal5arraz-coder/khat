/** Internal team notes on a partner. */

import { and, desc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { partnerNotes } from "@/lib/db/schema/partnership-crm"
import type { PartnerNote } from "@/types/database"
import { logActivity } from "./activities"

export async function getNotes(leadId: string): Promise<PartnerNote[]> {
  if (!db) return []
  const rows = await db
    .select()
    .from(partnerNotes)
    .where(eq(partnerNotes.lead_id, leadId))
    // Pinned first, then newest.
    .orderBy(desc(partnerNotes.pinned), desc(partnerNotes.created_at))
  return rows.map(rowToNote)
}

export async function createNote(
  leadId: string,
  body: string,
  author?: string | null,
): Promise<PartnerNote | null> {
  if (!db) return null
  const [row] = await db
    .insert(partnerNotes)
    .values({ lead_id: leadId, body, author: author ?? null })
    .returning()
  await logActivity(leadId, {
    type: "note_added",
    summary: `أضاف ملاحظة داخلية`,
    actor: author ?? null,
    metadata: { note_id: row.id },
  })
  return rowToNote(row)
}

export async function deleteNote(leadId: string, noteId: string): Promise<void> {
  if (!db) return
  await db.delete(partnerNotes).where(and(eq(partnerNotes.id, noteId), eq(partnerNotes.lead_id, leadId)))
}

export async function setNotePinned(leadId: string, noteId: string, pinned: boolean): Promise<void> {
  if (!db) return
  await db
    .update(partnerNotes)
    .set({ pinned })
    .where(and(eq(partnerNotes.id, noteId), eq(partnerNotes.lead_id, leadId)))
}

function rowToNote(r: typeof partnerNotes.$inferSelect): PartnerNote {
  return {
    id: r.id,
    lead_id: r.lead_id,
    body: r.body,
    author: r.author ?? null,
    pinned: r.pinned,
    created_at: (r.created_at ?? new Date()).toISOString(),
    updated_at: (r.updated_at ?? new Date()).toISOString(),
  }
}
