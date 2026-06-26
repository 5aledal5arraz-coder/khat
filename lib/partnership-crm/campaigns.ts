/** Campaign execution + post-campaign performance / ROI. */

import { and, desc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { partnerCampaigns } from "@/lib/db/schema/partnership-crm"
import type {
  PartnerCampaign,
  PartnerCampaignDeliverable,
  PartnerCampaignStatus,
} from "@/types/database"
import { logActivity } from "./activities"

export interface CreateCampaignInput {
  title: string
  status?: PartnerCampaignStatus
  episode_refs?: string[]
  deliverables?: PartnerCampaignDeliverable[]
  start_date?: string | null
  end_date?: string | null
  metrics?: Record<string, number>
  roi_notes?: string | null
  performance_summary?: string | null
  created_by?: string | null
}

export async function getCampaigns(leadId: string): Promise<PartnerCampaign[]> {
  if (!db) return []
  const rows = await db
    .select()
    .from(partnerCampaigns)
    .where(eq(partnerCampaigns.lead_id, leadId))
    .orderBy(desc(partnerCampaigns.created_at))
  return rows.map(rowToCampaign)
}

export async function getCampaign(leadId: string, campaignId: string): Promise<PartnerCampaign | null> {
  if (!db) return null
  const [row] = await db
    .select()
    .from(partnerCampaigns)
    .where(and(eq(partnerCampaigns.id, campaignId), eq(partnerCampaigns.lead_id, leadId)))
    .limit(1)
  return row ? rowToCampaign(row) : null
}

export async function createCampaign(
  leadId: string,
  input: CreateCampaignInput,
): Promise<PartnerCampaign | null> {
  if (!db) return null
  const [row] = await db
    .insert(partnerCampaigns)
    .values({
      lead_id: leadId,
      title: input.title,
      status: input.status ?? "planned",
      episode_refs: input.episode_refs ?? [],
      deliverables: input.deliverables ?? [],
      start_date: input.start_date ? new Date(input.start_date) : null,
      end_date: input.end_date ? new Date(input.end_date) : null,
      metrics: input.metrics ?? {},
      roi_notes: input.roi_notes ?? null,
      performance_summary: input.performance_summary ?? null,
      created_by: input.created_by ?? null,
    })
    .returning()
  await logActivity(leadId, {
    type: "campaign_updated",
    summary: `أُنشئت حملة: ${input.title}`,
    actor: input.created_by ?? null,
    metadata: { campaign_id: row.id },
  })
  return rowToCampaign(row)
}

export async function updateCampaign(
  leadId: string,
  campaignId: string,
  patch: Partial<CreateCampaignInput>,
): Promise<PartnerCampaign | null> {
  if (!db) return null
  const set: Partial<typeof partnerCampaigns.$inferInsert> = { updated_at: new Date() }
  if (patch.title !== undefined) set.title = patch.title
  if (patch.status !== undefined) set.status = patch.status
  if (patch.episode_refs !== undefined) set.episode_refs = patch.episode_refs
  if (patch.deliverables !== undefined) set.deliverables = patch.deliverables
  if (patch.start_date !== undefined) set.start_date = patch.start_date ? new Date(patch.start_date) : null
  if (patch.end_date !== undefined) set.end_date = patch.end_date ? new Date(patch.end_date) : null
  if (patch.metrics !== undefined) set.metrics = patch.metrics
  if (patch.roi_notes !== undefined) set.roi_notes = patch.roi_notes
  if (patch.performance_summary !== undefined) set.performance_summary = patch.performance_summary
  const [row] = await db
    .update(partnerCampaigns)
    .set(set)
    .where(and(eq(partnerCampaigns.id, campaignId), eq(partnerCampaigns.lead_id, leadId)))
    .returning()
  if (!row) return null
  await logActivity(leadId, {
    type: "campaign_updated",
    summary: `حُدّثت حملة: ${row.title} (${row.status})`,
    actor: patch.created_by ?? null,
    metadata: { campaign_id: row.id, status: row.status },
  })
  return rowToCampaign(row)
}

function rowToCampaign(r: typeof partnerCampaigns.$inferSelect): PartnerCampaign {
  return {
    id: r.id,
    lead_id: r.lead_id,
    title: r.title,
    status: r.status as PartnerCampaignStatus,
    episode_refs: (r.episode_refs as string[]) ?? [],
    deliverables: (r.deliverables as PartnerCampaignDeliverable[]) ?? [],
    start_date: r.start_date ? r.start_date.toISOString() : null,
    end_date: r.end_date ? r.end_date.toISOString() : null,
    metrics: (r.metrics as Record<string, number>) ?? {},
    roi_notes: r.roi_notes ?? null,
    performance_summary: r.performance_summary ?? null,
    created_by: r.created_by ?? null,
    created_at: (r.created_at ?? new Date()).toISOString(),
    updated_at: (r.updated_at ?? new Date()).toISOString(),
  }
}
