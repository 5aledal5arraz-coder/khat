/** Tasks / follow-up reminders — created by operators or the AI Director. */

import { and, asc, desc, eq, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { partnerTasks } from "@/lib/db/schema/partnership-crm"
import type {
  PartnerTask,
  PartnerTaskPriority,
  PartnerTaskStatus,
  PartnerTaskType,
} from "@/types/database"
import { logActivity } from "./activities"

export interface CreateTaskInput {
  title: string
  detail?: string | null
  type?: PartnerTaskType | string
  priority?: PartnerTaskPriority
  due_at?: string | null
  created_by?: string | null
}

export async function getTasks(leadId: string): Promise<PartnerTask[]> {
  if (!db) return []
  const rows = await db
    .select()
    .from(partnerTasks)
    .where(eq(partnerTasks.lead_id, leadId))
    // Open tasks first, soonest due first, then newest.
    .orderBy(
      sql`case when ${partnerTasks.status} = 'open' then 0 else 1 end`,
      asc(partnerTasks.due_at),
      desc(partnerTasks.created_at),
    )
  return rows.map(rowToTask)
}

export async function createTask(leadId: string, input: CreateTaskInput): Promise<PartnerTask | null> {
  if (!db) return null
  const [row] = await db
    .insert(partnerTasks)
    .values({
      lead_id: leadId,
      title: input.title,
      detail: input.detail ?? null,
      type: input.type ?? "follow_up",
      priority: input.priority ?? "normal",
      due_at: input.due_at ? new Date(input.due_at) : null,
      created_by: input.created_by ?? null,
    })
    .returning()
  await logActivity(leadId, {
    type: "task_created",
    summary: `أُنشئت مهمة: ${input.title}`,
    actor: input.created_by ?? null,
    metadata: { task_id: row.id, task_type: row.type },
  })
  return rowToTask(row)
}

export async function setTaskStatus(
  leadId: string,
  taskId: string,
  status: PartnerTaskStatus,
  actor?: string | null,
): Promise<void> {
  if (!db) return
  const [row] = await db
    .update(partnerTasks)
    .set({ status, completed_at: status === "done" ? new Date() : null })
    .where(and(eq(partnerTasks.id, taskId), eq(partnerTasks.lead_id, leadId)))
    .returning()
  if (row && status === "done") {
    await logActivity(leadId, {
      type: "task_completed",
      summary: `أُنجزت مهمة: ${row.title}`,
      actor: actor ?? null,
      metadata: { task_id: taskId },
    })
  }
}

export async function deleteTask(leadId: string, taskId: string): Promise<void> {
  if (!db) return
  await db.delete(partnerTasks).where(and(eq(partnerTasks.id, taskId), eq(partnerTasks.lead_id, leadId)))
}

/** Does this lead already have an open task of a given type? (idempotency for AI auto-tasks.) */
export async function hasOpenTaskOfType(leadId: string, type: string): Promise<boolean> {
  if (!db) return false
  const [row] = await db
    .select({ id: partnerTasks.id })
    .from(partnerTasks)
    .where(
      and(eq(partnerTasks.lead_id, leadId), eq(partnerTasks.type, type), eq(partnerTasks.status, "open")),
    )
    .limit(1)
  return Boolean(row)
}

function rowToTask(r: typeof partnerTasks.$inferSelect): PartnerTask {
  return {
    id: r.id,
    lead_id: r.lead_id,
    title: r.title,
    detail: r.detail ?? null,
    type: r.type,
    status: r.status as PartnerTaskStatus,
    priority: r.priority as PartnerTaskPriority,
    due_at: r.due_at ? r.due_at.toISOString() : null,
    created_by: r.created_by ?? null,
    completed_at: r.completed_at ? r.completed_at.toISOString() : null,
    created_at: (r.created_at ?? new Date()).toISOString(),
  }
}
