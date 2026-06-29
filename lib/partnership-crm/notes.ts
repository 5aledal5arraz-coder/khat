/**
 * Internal team notes on a partner — a thin partner-scoped adapter over the
 * shared polymorphic CRM core (`lib/crm`). Storage lives in `crm_notes` keyed by
 * subject_kind="partner", subject_id=lead_id. The core's createNote already
 * writes the "note_added" timeline entry, so these wrappers only bind the kind.
 */

import {
  getNotes as crmGetNotes,
  createNote as crmCreateNote,
  deleteNote as crmDeleteNote,
  setNotePinned as crmSetNotePinned,
} from "@/lib/crm"
import type { CrmNote } from "@/types/database"

const SUBJECT_KIND = "partner" as const

export function getNotes(leadId: string): Promise<CrmNote[]> {
  return crmGetNotes(SUBJECT_KIND, leadId)
}

export function createNote(
  leadId: string,
  body: string,
  author?: string | null,
): Promise<CrmNote | null> {
  return crmCreateNote(SUBJECT_KIND, leadId, body, author)
}

export function deleteNote(leadId: string, noteId: string): Promise<void> {
  return crmDeleteNote(SUBJECT_KIND, leadId, noteId)
}

export function setNotePinned(leadId: string, noteId: string, pinned: boolean): Promise<void> {
  return crmSetNotePinned(SUBJECT_KIND, leadId, noteId, pinned)
}
