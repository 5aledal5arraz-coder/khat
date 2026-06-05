/**
 * Guest Candidates — query layer.
 *
 * Pure DB read/write functions for the standalone guest_candidates module.
 * No coupling to episodes/studio/guests modules.
 */

import { db } from "@/lib/db"
import {
  guestCandidates,
  guestCandidateSocialLinks,
  guestCandidateStatusHistory,
  guestCandidateOutreachMessages,
  prepFormLinks,
  prepFormResponses,
} from "@/lib/db/schema/guest-candidates"
import { and, desc, eq, ilike, inArray, isNull, sql, or } from "drizzle-orm"
import type {
  GuestCandidate,
  GuestCandidateSocialLink,
  GuestCandidateView,
  GuestCandidateStatus,
  GuestCandidatePriority,
} from "@/types/database"

function requireDb() {
  if (!db) throw new Error("Database not configured")
  return db
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export interface ListCandidatesFilters {
  status?: GuestCandidateStatus | GuestCandidateStatus[]
  category?: string
  priority?: GuestCandidatePriority
  search?: string
  includeArchived?: boolean
  includeDeleted?: boolean
  limit?: number
  offset?: number
}

export async function listCandidates(filters: ListCandidatesFilters = {}): Promise<GuestCandidateView[]> {
  const d = requireDb()
  const conditions = []

  if (!filters.includeDeleted) {
    conditions.push(isNull(guestCandidates.deleted_at))
  }
  if (!filters.includeArchived) {
    conditions.push(isNull(guestCandidates.archived_at))
  }
  if (filters.status) {
    if (Array.isArray(filters.status)) {
      conditions.push(inArray(guestCandidates.status, filters.status))
    } else {
      conditions.push(eq(guestCandidates.status, filters.status))
    }
  }
  if (filters.category) {
    conditions.push(eq(guestCandidates.category, filters.category))
  }
  if (filters.priority) {
    conditions.push(eq(guestCandidates.priority_level, filters.priority))
  }
  if (filters.search) {
    const term = `%${filters.search}%`
    conditions.push(
      or(
        ilike(guestCandidates.full_name, term),
        ilike(guestCandidates.display_name, term),
        ilike(guestCandidates.bio, term),
      )!,
    )
  }

  const rows = await d
    .select()
    .from(guestCandidates)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(guestCandidates.updated_at))
    .limit(filters.limit ?? 200)
    .offset(filters.offset ?? 0)

  if (rows.length === 0) return []

  const ids = rows.map((r) => r.id)

  // Fetch related counts in parallel
  const [socials, prepCounts, responseCounts, outreachCounts] = await Promise.all([
    d
      .select()
      .from(guestCandidateSocialLinks)
      .where(inArray(guestCandidateSocialLinks.candidate_id, ids)),
    d
      .select({
        candidate_id: prepFormLinks.candidate_id,
        count: sql<number>`count(*)::int`,
      })
      .from(prepFormLinks)
      .where(inArray(prepFormLinks.candidate_id, ids))
      .groupBy(prepFormLinks.candidate_id),
    d
      .select({
        candidate_id: prepFormResponses.candidate_id,
        count: sql<number>`count(*)::int`,
        completed: sql<number>`count(*) filter (where ${prepFormResponses.submitted_at} is not null)::int`,
      })
      .from(prepFormResponses)
      .where(inArray(prepFormResponses.candidate_id, ids))
      .groupBy(prepFormResponses.candidate_id),
    d
      .select({
        candidate_id: guestCandidateOutreachMessages.candidate_id,
        count: sql<number>`count(*)::int`,
      })
      .from(guestCandidateOutreachMessages)
      .where(inArray(guestCandidateOutreachMessages.candidate_id, ids))
      .groupBy(guestCandidateOutreachMessages.candidate_id),
  ])

  const socialsByCandidate = new Map<string, GuestCandidateSocialLink[]>()
  for (const s of socials) {
    const arr = socialsByCandidate.get(s.candidate_id) ?? []
    arr.push(s as unknown as GuestCandidateSocialLink)
    socialsByCandidate.set(s.candidate_id, arr)
  }

  const prepCountByCandidate = new Map(prepCounts.map((r) => [r.candidate_id, r.count]))
  const responseCountByCandidate = new Map(responseCounts.map((r) => [r.candidate_id, { count: r.count, completed: r.completed }]))
  const outreachCountByCandidate = new Map(outreachCounts.map((r) => [r.candidate_id, r.count]))

  return rows.map((row) => {
    const respInfo = responseCountByCandidate.get(row.id)
    return {
      ...(row as unknown as GuestCandidate),
      social_links: socialsByCandidate.get(row.id) ?? [],
      prep_links_count: prepCountByCandidate.get(row.id) ?? 0,
      responses_count: respInfo?.count ?? 0,
      has_completed_prep: (respInfo?.completed ?? 0) > 0,
      outreach_count: outreachCountByCandidate.get(row.id) ?? 0,
    }
  })
}

export async function getCandidate(id: string): Promise<GuestCandidateView | null> {
  const d = requireDb()
  const [row] = await d.select().from(guestCandidates).where(eq(guestCandidates.id, id)).limit(1)
  if (!row) return null

  const [socials, preps, responses, outreach] = await Promise.all([
    d.select().from(guestCandidateSocialLinks).where(eq(guestCandidateSocialLinks.candidate_id, id)),
    d.select().from(prepFormLinks).where(eq(prepFormLinks.candidate_id, id)),
    d.select().from(prepFormResponses).where(eq(prepFormResponses.candidate_id, id)),
    d.select().from(guestCandidateOutreachMessages).where(eq(guestCandidateOutreachMessages.candidate_id, id)),
  ])

  return {
    ...(row as unknown as GuestCandidate),
    social_links: socials as unknown as GuestCandidateSocialLink[],
    prep_links_count: preps.length,
    responses_count: responses.length,
    has_completed_prep: responses.some((r) => r.submitted_at !== null),
    outreach_count: outreach.length,
  }
}

export async function getCandidateStats() {
  const d = requireDb()
  const [counts] = await d
    .select({
      total: sql<number>`count(*)::int`,
      new: sql<number>`count(*) filter (where ${guestCandidates.status} = 'new')::int`,
      researching: sql<number>`count(*) filter (where ${guestCandidates.status} = 'researching')::int`,
      analyzed: sql<number>`count(*) filter (where ${guestCandidates.status} = 'analyzed')::int`,
      shortlisted: sql<number>`count(*) filter (where ${guestCandidates.status} = 'shortlisted')::int`,
      contacted: sql<number>`count(*) filter (where ${guestCandidates.status} = 'contacted')::int`,
      accepted: sql<number>`count(*) filter (where ${guestCandidates.status} = 'accepted')::int`,
      declined: sql<number>`count(*) filter (where ${guestCandidates.status} = 'declined')::int`,
      prep_completed: sql<number>`count(*) filter (where ${guestCandidates.status} = 'prep_completed')::int`,
    })
    .from(guestCandidates)
    .where(and(isNull(guestCandidates.deleted_at), isNull(guestCandidates.archived_at)))
  return counts
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

export interface CreateCandidateInput {
  full_name: string
  display_name?: string | null
  slug?: string | null
  primary_language?: string | null
  category?: string | null
  city?: string | null
  country?: string | null
  bio?: string | null
  notes_internal?: string | null
  source_type?: string | null
  source_note?: string | null
  priority_level?: GuestCandidatePriority | null
  status?: GuestCandidateStatus | null
  social_links?: { platform: string; url: string; label?: string | null; is_primary?: boolean }[]
}

function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[\s\u0600-\u06FF]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || `candidate-${Date.now()}`
}

export async function createCandidate(input: CreateCandidateInput, actorId?: string): Promise<GuestCandidate> {
  const d = requireDb()
  const baseSlug = input.slug || slugify(input.full_name)

  // Ensure unique slug
  let finalSlug = baseSlug
  let suffix = 1
  while (true) {
    const [existing] = await d
      .select({ id: guestCandidates.id })
      .from(guestCandidates)
      .where(eq(guestCandidates.slug, finalSlug))
      .limit(1)
    if (!existing) break
    suffix += 1
    finalSlug = `${baseSlug}-${suffix}`
  }

  const [created] = await d
    .insert(guestCandidates)
    .values({
      full_name: input.full_name,
      display_name: input.display_name ?? null,
      slug: finalSlug,
      primary_language: input.primary_language ?? "ar",
      category: input.category ?? null,
      city: input.city ?? null,
      country: input.country ?? null,
      bio: input.bio ?? null,
      notes_internal: input.notes_internal ?? null,
      source_type: input.source_type ?? "manual",
      source_note: input.source_note ?? null,
      priority_level: input.priority_level ?? "medium",
      status: input.status ?? "new",
    })
    .returning()

  if (input.social_links?.length) {
    await d.insert(guestCandidateSocialLinks).values(
      input.social_links.map((s) => ({
        candidate_id: created.id,
        platform: s.platform,
        url: s.url,
        label: s.label ?? null,
        is_primary: s.is_primary ?? false,
        source: "manual",
      })),
    )
  }

  await d.insert(guestCandidateStatusHistory).values({
    candidate_id: created.id,
    old_status: null,
    new_status: created.status,
    changed_by: actorId ?? null,
    change_note: "Candidate created",
  })

  return created as unknown as GuestCandidate
}

export interface UpdateCandidateInput {
  full_name?: string
  display_name?: string | null
  primary_language?: string | null
  category?: string | null
  city?: string | null
  country?: string | null
  bio?: string | null
  notes_internal?: string | null
  source_note?: string | null
  priority_level?: GuestCandidatePriority | null
}

export async function updateCandidate(id: string, input: UpdateCandidateInput): Promise<GuestCandidate | null> {
  const d = requireDb()
  const [updated] = await d
    .update(guestCandidates)
    .set({
      ...input,
      updated_at: new Date(),
    })
    .where(eq(guestCandidates.id, id))
    .returning()
  return (updated as unknown as GuestCandidate) ?? null
}

export async function changeCandidateStatus(
  id: string,
  newStatus: GuestCandidateStatus,
  actorId?: string,
  note?: string,
): Promise<GuestCandidate | null> {
  const d = requireDb()
  const [current] = await d.select().from(guestCandidates).where(eq(guestCandidates.id, id)).limit(1)
  if (!current) return null
  if (current.status === newStatus) return current as unknown as GuestCandidate

  const [updated] = await d
    .update(guestCandidates)
    .set({ status: newStatus, updated_at: new Date() })
    .where(eq(guestCandidates.id, id))
    .returning()

  await d.insert(guestCandidateStatusHistory).values({
    candidate_id: id,
    old_status: current.status,
    new_status: newStatus,
    changed_by: actorId ?? null,
    change_note: note ?? null,
  })

  return updated as unknown as GuestCandidate
}

export async function archiveCandidate(id: string, actorId?: string): Promise<void> {
  const d = requireDb()
  await d
    .update(guestCandidates)
    .set({ archived_at: new Date(), updated_at: new Date() })
    .where(eq(guestCandidates.id, id))
  await d.insert(guestCandidateStatusHistory).values({
    candidate_id: id,
    old_status: null,
    new_status: "archived",
    changed_by: actorId ?? null,
    change_note: "Archived",
  })
}

export async function unarchiveCandidate(id: string): Promise<void> {
  const d = requireDb()
  await d
    .update(guestCandidates)
    .set({ archived_at: null, updated_at: new Date() })
    .where(eq(guestCandidates.id, id))
}

export async function softDeleteCandidate(id: string): Promise<void> {
  const d = requireDb()
  await d
    .update(guestCandidates)
    .set({ deleted_at: new Date(), updated_at: new Date() })
    .where(eq(guestCandidates.id, id))
}

// ---------------------------------------------------------------------------
// Social links
// ---------------------------------------------------------------------------

export async function listSocialLinks(candidateId: string): Promise<GuestCandidateSocialLink[]> {
  const d = requireDb()
  const rows = await d
    .select()
    .from(guestCandidateSocialLinks)
    .where(eq(guestCandidateSocialLinks.candidate_id, candidateId))
  return rows as unknown as GuestCandidateSocialLink[]
}

export async function addSocialLink(
  candidateId: string,
  link: { platform: string; url: string; label?: string | null; is_primary?: boolean; source?: string },
): Promise<GuestCandidateSocialLink> {
  const d = requireDb()
  const [row] = await d
    .insert(guestCandidateSocialLinks)
    .values({
      candidate_id: candidateId,
      platform: link.platform,
      url: link.url,
      label: link.label ?? null,
      is_primary: link.is_primary ?? false,
      source: link.source ?? "manual",
    })
    .returning()
  return row as unknown as GuestCandidateSocialLink
}

export async function deleteSocialLink(linkId: string): Promise<void> {
  const d = requireDb()
  await d.delete(guestCandidateSocialLinks).where(eq(guestCandidateSocialLinks.id, linkId))
}

// ---------------------------------------------------------------------------
// Status history
// ---------------------------------------------------------------------------

export async function listStatusHistory(candidateId: string) {
  const d = requireDb()
  return d
    .select()
    .from(guestCandidateStatusHistory)
    .where(eq(guestCandidateStatusHistory.candidate_id, candidateId))
    .orderBy(desc(guestCandidateStatusHistory.created_at))
}
