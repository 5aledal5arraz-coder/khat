/** Shared CRM internal notes — polymorphic over (subject_kind, subject_id). */

import { and, desc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { crmNotes } from "@/lib/db/schema/crm"
import type { CrmNote, CrmSubjectKind } from "@/types/database"
import { logActivity } from "./activities"

export async function getNotes(subjectKind: CrmSubjectKind, subjectId: string): Promise<CrmNote[]> {
  if (!db) return []
  const rows = await db
    .select()
    .from(crmNotes)
    .where(and(eq(crmNotes.subject_kind, subjectKind), eq(crmNotes.subject_id, subjectId)))
    .orderBy(desc(crmNotes.pinned), desc(crmNotes.created_at))
  return rows.map(rowToNote)
}

export async function createNote(
  subjectKind: CrmSubjectKind,
  subjectId: string,
  body: string,
  author?: string | null,
): Promise<CrmNote | null> {
  if (!db) return null
  const [row] = await db
    .insert(crmNotes)
    .values({ subject_kind: subjectKind, subject_id: subjectId, body, author: author ?? null })
    .returning()
  await logActivity(subjectKind, subjectId, {
    type: "note_added",
    summary: "أضاف ملاحظة داخلية",
    actor: author ?? null,
    metadata: { note_id: row.id },
  })
  return rowToNote(row)
}

export async function deleteNote(subjectKind: CrmSubjectKind, subjectId: string, noteId: string): Promise<void> {
  if (!db) return
  await db
    .delete(crmNotes)
    .where(and(eq(crmNotes.id, noteId), eq(crmNotes.subject_kind, subjectKind), eq(crmNotes.subject_id, subjectId)))
}

export async function setNotePinned(
  subjectKind: CrmSubjectKind,
  subjectId: string,
  noteId: string,
  pinned: boolean,
): Promise<void> {
  if (!db) return
  await db
    .update(crmNotes)
    .set({ pinned })
    .where(and(eq(crmNotes.id, noteId), eq(crmNotes.subject_kind, subjectKind), eq(crmNotes.subject_id, subjectId)))
}

export async function deleteNotesForSubject(subjectKind: CrmSubjectKind, subjectId: string): Promise<void> {
  if (!db) return
  await db
    .delete(crmNotes)
    .where(and(eq(crmNotes.subject_kind, subjectKind), eq(crmNotes.subject_id, subjectId)))
}

function rowToNote(r: typeof crmNotes.$inferSelect): CrmNote {
  return {
    id: r.id,
    subject_kind: r.subject_kind,
    subject_id: r.subject_id,
    body: r.body,
    author: r.author ?? null,
    pinned: r.pinned,
    created_at: (r.created_at ?? new Date()).toISOString(),
    updated_at: (r.updated_at ?? new Date()).toISOString(),
  }
}
