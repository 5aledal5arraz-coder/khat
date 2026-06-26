/** Shared polymorphic CRM core — activity timeline, notes, tasks. */

export * from "./activities"
export * from "./notes"
export * from "./tasks"

import type { CrmSubjectKind } from "@/types/database"
import { deleteActivitiesForSubject } from "./activities"
import { deleteNotesForSubject } from "./notes"
import { deleteTasksForSubject } from "./tasks"

/**
 * Delete all CRM rows (activities, notes, tasks) for a subject. Polymorphic
 * rows can't FK-cascade, so call this when the underlying subject is deleted.
 */
export async function deleteCrmForSubject(subjectKind: CrmSubjectKind, subjectId: string): Promise<void> {
  await Promise.all([
    deleteActivitiesForSubject(subjectKind, subjectId),
    deleteNotesForSubject(subjectKind, subjectId),
    deleteTasksForSubject(subjectKind, subjectId),
  ])
}
