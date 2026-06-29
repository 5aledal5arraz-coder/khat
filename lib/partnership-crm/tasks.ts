/**
 * Tasks / follow-up reminders — a thin partner-scoped adapter over the shared
 * polymorphic CRM core (`lib/crm`). Storage lives in `crm_tasks` keyed by
 * subject_kind="partner", subject_id=lead_id. The core writes the
 * "task_created" / "task_completed" timeline entries, so these wrappers only
 * bind the kind and keep the partner task vocab.
 */

import {
  getTasks as crmGetTasks,
  createTask as crmCreateTask,
  setTaskStatus as crmSetTaskStatus,
  deleteTask as crmDeleteTask,
  hasOpenTaskOfType as crmHasOpenTaskOfType,
} from "@/lib/crm"
import type {
  CrmTask,
  CrmTaskPriority,
  CrmTaskStatus,
  PartnerTaskType,
} from "@/types/database"

const SUBJECT_KIND = "partner" as const

export interface CreateTaskInput {
  title: string
  detail?: string | null
  type?: PartnerTaskType | string
  priority?: CrmTaskPriority
  due_at?: string | null
  created_by?: string | null
}

export function getTasks(leadId: string): Promise<CrmTask[]> {
  return crmGetTasks(SUBJECT_KIND, leadId)
}

export function createTask(leadId: string, input: CreateTaskInput): Promise<CrmTask | null> {
  return crmCreateTask(SUBJECT_KIND, leadId, input)
}

export function setTaskStatus(
  leadId: string,
  taskId: string,
  status: CrmTaskStatus,
  actor?: string | null,
): Promise<void> {
  return crmSetTaskStatus(SUBJECT_KIND, leadId, taskId, status, actor)
}

export function deleteTask(leadId: string, taskId: string): Promise<void> {
  return crmDeleteTask(SUBJECT_KIND, leadId, taskId)
}

/** Does this lead already have an open task of a given type? (idempotency for AI auto-tasks.) */
export function hasOpenTaskOfType(leadId: string, type: string): Promise<boolean> {
  return crmHasOpenTaskOfType(SUBJECT_KIND, leadId, type)
}
