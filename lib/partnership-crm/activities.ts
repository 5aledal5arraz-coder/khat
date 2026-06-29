/**
 * Partner activity timeline — a thin partner-scoped adapter over the shared
 * polymorphic CRM core (`lib/crm`). Storage lives in `crm_activities` keyed by
 * subject_kind="partner", subject_id=lead_id. `logActivity` stays fire-safe via
 * the core. These wrappers exist only so partner code keeps its leadId-first
 * ergonomics and the frozen partner activity vocab.
 */

import {
  logActivity as crmLogActivity,
  getActivities as crmGetActivities,
} from "@/lib/crm"
import type { CrmActivity, PartnerActivityType } from "@/types/database"

const SUBJECT_KIND = "partner" as const

export interface LogActivityInput {
  type: PartnerActivityType | string
  summary: string
  actor?: string | null
  metadata?: Record<string, unknown>
}

/** Record one timeline event. Swallows errors so logging is never load-bearing. */
export function logActivity(leadId: string, input: LogActivityInput): Promise<void> {
  return crmLogActivity(SUBJECT_KIND, leadId, input)
}

export function getActivities(leadId: string, limit = 100): Promise<CrmActivity[]> {
  return crmGetActivities(SUBJECT_KIND, leadId, limit)
}
