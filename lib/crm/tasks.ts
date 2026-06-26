/** Shared CRM tasks / reminders — polymorphic over (subject_kind, subject_id). */

import { and, asc, desc, eq, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { crmTasks } from "@/lib/db/schema/crm"
import type { CrmTask, CrmTaskPriority, CrmTaskStatus, CrmSubjectKind } from "@/types/database"
import { logActivity } from "./activities"

export interface CreateTaskInput {
  title: string
  detail?: string | null
  type?: string
  priority?: CrmTaskPriority
  due_at?: string | null
  created_by?: string | null
}

export async function getTasks(subjectKind: CrmSubjectKind, subjectId: string): Promise<CrmTask[]> {
  if (!db) return []
  const rows = await db
    .select()
    .from(crmTasks)
    .where(and(eq(crmTasks.subject_kind, subjectKind), eq(crmTasks.subject_id, subjectId)))
    .orderBy(
      sql`case when ${crmTasks.status} = 'open' then 0 else 1 end`,
      asc(crmTasks.due_at),
      desc(crmTasks.created_at),
    )
  return rows.map(rowToTask)
}

export async function createTask(
  subjectKind: CrmSubjectKind,
  subjectId: string,
  input: CreateTaskInput,
): Promise<CrmTask | null> {
  if (!db) return null
  const [row] = await db
    .insert(crmTasks)
    .values({
      subject_kind: subjectKind,
      subject_id: subjectId,
      title: input.title,
      detail: input.detail ?? null,
      type: input.type ?? "follow_up",
      priority: input.priority ?? "normal",
      due_at: input.due_at ? new Date(input.due_at) : null,
      created_by: input.created_by ?? null,
    })
    .returning()
  await logActivity(subjectKind, subjectId, {
    type: "task_created",
    summary: `أُنشئت مهمة: ${input.title}`,
    actor: input.created_by ?? null,
    metadata: { task_id: row.id, task_type: row.type },
  })
  return rowToTask(row)
}

export async function setTaskStatus(
  subjectKind: CrmSubjectKind,
  subjectId: string,
  taskId: string,
  status: CrmTaskStatus,
  actor?: string | null,
): Promise<void> {
  if (!db) return
  const [row] = await db
    .update(crmTasks)
    .set({ status, completed_at: status === "done" ? new Date() : null })
    .where(and(eq(crmTasks.id, taskId), eq(crmTasks.subject_kind, subjectKind), eq(crmTasks.subject_id, subjectId)))
    .returning()
  if (row && status === "done") {
    await logActivity(subjectKind, subjectId, {
      type: "task_completed",
      summary: `أُنجزت مهمة: ${row.title}`,
      actor: actor ?? null,
      metadata: { task_id: taskId },
    })
  }
}

export async function deleteTask(subjectKind: CrmSubjectKind, subjectId: string, taskId: string): Promise<void> {
  if (!db) return
  await db
    .delete(crmTasks)
    .where(and(eq(crmTasks.id, taskId), eq(crmTasks.subject_kind, subjectKind), eq(crmTasks.subject_id, subjectId)))
}

/** Idempotency guard for auto-created tasks: is there an open task of this type? */
export async function hasOpenTaskOfType(subjectKind: CrmSubjectKind, subjectId: string, type: string): Promise<boolean> {
  if (!db) return false
  const [row] = await db
    .select({ id: crmTasks.id })
    .from(crmTasks)
    .where(
      and(
        eq(crmTasks.subject_kind, subjectKind),
        eq(crmTasks.subject_id, subjectId),
        eq(crmTasks.type, type),
        eq(crmTasks.status, "open"),
      ),
    )
    .limit(1)
  return Boolean(row)
}

export async function deleteTasksForSubject(subjectKind: CrmSubjectKind, subjectId: string): Promise<void> {
  if (!db) return
  await db
    .delete(crmTasks)
    .where(and(eq(crmTasks.subject_kind, subjectKind), eq(crmTasks.subject_id, subjectId)))
}

function rowToTask(r: typeof crmTasks.$inferSelect): CrmTask {
  return {
    id: r.id,
    subject_kind: r.subject_kind,
    subject_id: r.subject_id,
    title: r.title,
    detail: r.detail ?? null,
    type: r.type,
    status: r.status as CrmTaskStatus,
    priority: r.priority as CrmTaskPriority,
    due_at: r.due_at ? r.due_at.toISOString() : null,
    created_by: r.created_by ?? null,
    completed_at: r.completed_at ? r.completed_at.toISOString() : null,
    created_at: (r.created_at ?? new Date()).toISOString(),
  }
}
