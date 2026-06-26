/**
 * Shared CRM activity timeline — polymorphic over (subject_kind, subject_id).
 * `logActivity` is fire-safe: a failed log never breaks the calling action.
 */

import { and, desc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { crmActivities } from "@/lib/db/schema/crm"
import type { CrmActivity, CrmSubjectKind } from "@/types/database"

export interface LogActivityInput {
  type: string
  summary: string
  actor?: string | null
  metadata?: Record<string, unknown>
}

export async function logActivity(
  subjectKind: CrmSubjectKind,
  subjectId: string,
  input: LogActivityInput,
): Promise<void> {
  if (!db) return
  try {
    await db.insert(crmActivities).values({
      subject_kind: subjectKind,
      subject_id: subjectId,
      type: input.type,
      summary: input.summary,
      actor: input.actor ?? null,
      metadata: input.metadata ?? {},
    })
  } catch (err) {
    console.error("[crm] logActivity failed", subjectKind, subjectId, input.type, err)
  }
}

export async function getActivities(
  subjectKind: CrmSubjectKind,
  subjectId: string,
  limit = 100,
): Promise<CrmActivity[]> {
  if (!db) return []
  const rows = await db
    .select()
    .from(crmActivities)
    .where(and(eq(crmActivities.subject_kind, subjectKind), eq(crmActivities.subject_id, subjectId)))
    .orderBy(desc(crmActivities.created_at))
    .limit(limit)
  return rows.map(rowToActivity)
}

/** Delete every CRM activity for a subject (polymorphic rows have no FK cascade). */
export async function deleteActivitiesForSubject(subjectKind: CrmSubjectKind, subjectId: string): Promise<void> {
  if (!db) return
  await db
    .delete(crmActivities)
    .where(and(eq(crmActivities.subject_kind, subjectKind), eq(crmActivities.subject_id, subjectId)))
}

function rowToActivity(r: typeof crmActivities.$inferSelect): CrmActivity {
  return {
    id: r.id,
    subject_kind: r.subject_kind,
    subject_id: r.subject_id,
    type: r.type,
    summary: r.summary,
    actor: r.actor ?? null,
    metadata: (r.metadata as Record<string, unknown>) ?? {},
    created_at: (r.created_at ?? new Date()).toISOString(),
  }
}
