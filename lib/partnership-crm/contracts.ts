/** Contract management — one current agreement per partner. */

import { desc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { partnerContracts } from "@/lib/db/schema/partnership-crm"
import type { PartnerContract, PartnerContractStatus } from "@/types/database"
import { logActivity } from "./activities"

export interface ContractPatch {
  title?: string | null
  status?: PartnerContractStatus
  value?: number | null
  currency?: string
  start_date?: string | null
  end_date?: string | null
  terms?: string | null
  document_url?: string | null
  signed_at?: string | null
  notes?: string | null
  created_by?: string | null
}

/** The latest contract row for a lead (null if none yet). */
export async function getContract(leadId: string): Promise<PartnerContract | null> {
  if (!db) return null
  const [row] = await db
    .select()
    .from(partnerContracts)
    .where(eq(partnerContracts.lead_id, leadId))
    .orderBy(desc(partnerContracts.created_at))
    .limit(1)
  return row ? rowToContract(row) : null
}

/** Create the contract if missing, else update the existing one. */
export async function upsertContract(
  leadId: string,
  patch: ContractPatch,
): Promise<PartnerContract | null> {
  if (!db) return null
  const set: Partial<typeof partnerContracts.$inferInsert> = { updated_at: new Date() }
  if (patch.title !== undefined) set.title = patch.title
  if (patch.status !== undefined) set.status = patch.status
  if (patch.value !== undefined) set.value = patch.value
  if (patch.currency !== undefined) set.currency = patch.currency
  if (patch.start_date !== undefined) set.start_date = patch.start_date ? new Date(patch.start_date) : null
  if (patch.end_date !== undefined) set.end_date = patch.end_date ? new Date(patch.end_date) : null
  if (patch.terms !== undefined) set.terms = patch.terms
  if (patch.document_url !== undefined) set.document_url = patch.document_url
  if (patch.signed_at !== undefined) set.signed_at = patch.signed_at ? new Date(patch.signed_at) : null
  if (patch.notes !== undefined) set.notes = patch.notes

  const existing = await getContract(leadId)
  let result: typeof partnerContracts.$inferSelect
  if (existing) {
    const [row] = await db
      .update(partnerContracts)
      .set(set)
      .where(eq(partnerContracts.id, existing.id))
      .returning()
    result = row
  } else {
    const [row] = await db
      .insert(partnerContracts)
      .values({ lead_id: leadId, created_by: patch.created_by ?? null, ...set })
      .returning()
    result = row
  }
  await logActivity(leadId, {
    type: "contract_updated",
    summary: existing
      ? `حُدّث العقد (${result.status})`
      : `أُنشئ عقد (${result.status})`,
    actor: patch.created_by ?? null,
    metadata: { contract_id: result.id, status: result.status },
  })
  return rowToContract(result)
}

function rowToContract(r: typeof partnerContracts.$inferSelect): PartnerContract {
  return {
    id: r.id,
    lead_id: r.lead_id,
    title: r.title ?? null,
    status: r.status as PartnerContractStatus,
    value: r.value ?? null,
    currency: r.currency,
    start_date: r.start_date ? r.start_date.toISOString() : null,
    end_date: r.end_date ? r.end_date.toISOString() : null,
    terms: r.terms ?? null,
    document_url: r.document_url ?? null,
    signed_at: r.signed_at ? r.signed_at.toISOString() : null,
    notes: r.notes ?? null,
    created_by: r.created_by ?? null,
    created_at: (r.created_at ?? new Date()).toISOString(),
    updated_at: (r.updated_at ?? new Date()).toISOString(),
  }
}
