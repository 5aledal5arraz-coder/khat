/** Community contribution queries. */

import { and, desc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { communityContributions } from "@/lib/db/schema/community"
import type {
  CommunityContribution,
  CommunityContributionStatus,
  CommunityContributionType,
} from "@/types/database"

export interface CreateContributionInput {
  type: CommunityContributionType | string
  title: string
  body: string
  details?: Record<string, unknown>
  contributor_name?: string | null
  contributor_email?: string | null
  reference?: string | null
}

export async function createCommunityContribution(input: CreateContributionInput): Promise<string | null> {
  if (!db) return null
  const [row] = await db
    .insert(communityContributions)
    .values({
      type: input.type,
      title: input.title,
      body: input.body,
      details: input.details ?? {},
      contributor_name: input.contributor_name ?? null,
      contributor_email: input.contributor_email ?? null,
      reference: input.reference ?? null,
      status: "new",
    })
    .returning({ id: communityContributions.id })
  return row?.id ?? null
}

export async function getCommunityContributionById(id: string): Promise<CommunityContribution | null> {
  if (!db) return null
  const [row] = await db.select().from(communityContributions).where(eq(communityContributions.id, id)).limit(1)
  return row ? rowTo(row) : null
}

/** Patch arbitrary fields; coerces timestamp strings to Date at the DB boundary. */
export async function updateCommunityContribution(
  id: string,
  data: Partial<Omit<CommunityContribution, "id" | "created_at">>,
): Promise<void> {
  if (!db) return
  const set = {
    ...data,
    ...(data.triaged_at ? { triaged_at: new Date(data.triaged_at) } : {}),
    ...(data.routed_at ? { routed_at: new Date(data.routed_at) } : {}),
  } as Partial<typeof communityContributions.$inferInsert>
  await db.update(communityContributions).set(set).where(eq(communityContributions.id, id))
}

export async function updateCommunityStatus(id: string, status: CommunityContributionStatus): Promise<void> {
  if (!db) return
  await db.update(communityContributions).set({ status }).where(eq(communityContributions.id, id))
}

export async function listCommunityContributions(filter?: {
  type?: CommunityContributionType | string
  status?: CommunityContributionStatus
}): Promise<CommunityContribution[]> {
  if (!db) return []
  const conds = []
  if (filter?.type) conds.push(eq(communityContributions.type, filter.type))
  if (filter?.status) conds.push(eq(communityContributions.status, filter.status))
  const rows = await db
    .select()
    .from(communityContributions)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(communityContributions.created_at))
  return rows.map(rowTo)
}

function rowTo(r: typeof communityContributions.$inferSelect): CommunityContribution {
  return {
    id: r.id,
    type: r.type,
    title: r.title,
    body: r.body,
    details: (r.details as Record<string, unknown>) ?? {},
    contributor_name: r.contributor_name ?? null,
    contributor_email: r.contributor_email ?? null,
    reference: r.reference ?? null,
    status: r.status as CommunityContributionStatus,
    routed_kind: r.routed_kind ?? null,
    routed_id: r.routed_id ?? null,
    routed_at: r.routed_at ? r.routed_at.toISOString() : null,
    triage_status: (r.triage_status as CommunityContribution["triage_status"]) ?? "generating",
    quality_score: r.quality_score ?? null,
    category: r.category ?? null,
    ai_summary: r.ai_summary ?? null,
    highlights: (r.highlights as string[]) ?? [],
    concerns: (r.concerns as string[]) ?? [],
    spam: r.spam ?? false,
    recommended_action: (r.recommended_action as CommunityContribution["recommended_action"]) ?? null,
    action_rationale: r.action_rationale ?? null,
    ai_raw: (r.ai_raw as Record<string, unknown>) ?? null,
    error_message: r.error_message ?? null,
    triaged_at: r.triaged_at ? r.triaged_at.toISOString() : null,
    created_at: (r.created_at ?? new Date()).toISOString(),
  }
}
