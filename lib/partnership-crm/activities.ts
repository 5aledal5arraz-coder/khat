/**
 * Partner activity timeline — append-only log of every interaction.
 * `logActivity` is fire-safe: a failed log never breaks the calling action.
 */

import { desc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { partnerActivities } from "@/lib/db/schema/partnership-crm"
import type { PartnerActivity, PartnerActivityType } from "@/types/database"

export interface LogActivityInput {
  type: PartnerActivityType | string
  summary: string
  actor?: string | null
  metadata?: Record<string, unknown>
}

/** Record one timeline event. Swallows errors so logging is never load-bearing. */
export async function logActivity(leadId: string, input: LogActivityInput): Promise<void> {
  if (!db) return
  try {
    await db.insert(partnerActivities).values({
      lead_id: leadId,
      type: input.type,
      summary: input.summary,
      actor: input.actor ?? null,
      metadata: input.metadata ?? {},
    })
  } catch (err) {
    console.error("[partner-crm] logActivity failed", leadId, input.type, err)
  }
}

export async function getActivities(leadId: string, limit = 100): Promise<PartnerActivity[]> {
  if (!db) return []
  const rows = await db
    .select()
    .from(partnerActivities)
    .where(eq(partnerActivities.lead_id, leadId))
    .orderBy(desc(partnerActivities.created_at))
    .limit(limit)
  return rows.map(rowToActivity)
}

function rowToActivity(r: typeof partnerActivities.$inferSelect): PartnerActivity {
  return {
    id: r.id,
    lead_id: r.lead_id,
    type: r.type,
    summary: r.summary,
    actor: r.actor ?? null,
    metadata: (r.metadata as Record<string, unknown>) ?? {},
    created_at: (r.created_at ?? new Date()).toISOString(),
  }
}
