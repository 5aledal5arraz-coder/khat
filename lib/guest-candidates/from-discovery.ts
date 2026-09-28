/**
 * Discovery → CRM (guest_candidates), without duplicates.
 *
 * Two buttons write here from a discovery result: «أضِف لقائمة التواصل» (the
 * run page) and «رشّحه لهالحلقة» (the EIR page, which also records the
 * episode in `target_eir_id`). Both used to INSERT unconditionally, so a
 * person surfaced by two runs landed in the CRM twice (Naif Al-Mutawa on
 * production, 2026-09-28). Now a candidate is matched first — the confident
 * Wikidata QID, else the folded name (the same `discoveryNameKey` cross-run
 * memory uses) — and the existing record is UPDATED instead.
 *
 * Existing duplicates are not merged here; that is a data decision.
 *
 * Nothing here creates a `guests` row: linking a candidate to a canonical
 * guest stays the explicit admin action in /admin/guest-candidates.
 */

import { and, eq, isNull, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { guestCandidates, guestCandidateSocialLinks } from "@/lib/db/schema/guest-candidates"
import { discoveryNameKey } from "@/lib/discovery-v2/memory"
import type { DiscoveryCandidateRecord } from "@/lib/discovery/candidates"
import { createCandidate, type CreateCandidateInput } from "./queries"

export interface CrmMatchRow {
  id: string
  full_name: string
  display_name: string | null
  wikidata_qid: string | null
}

/**
 * The existing CRM record this person already has, or null. Pure. The QID
 * wins (a respelled name is still the same entity); otherwise the folded
 * name of either `full_name` or `display_name` — EXCEPT when both sides
 * carry a QID and they differ: two confident Wikidata entities with one
 * name are two people (a namesake), never a merge.
 */
export function findCrmMatch<T extends CrmMatchRow>(
  rows: T[],
  person: { name: string; qid: string | null },
): T | null {
  if (person.qid) {
    const byQid = rows.find((r) => r.wikidata_qid === person.qid)
    if (byQid) return byQid
  }
  const key = discoveryNameKey(person.name)
  if (!key) return null
  return (
    rows.find(
      (r) =>
        !(person.qid && r.wikidata_qid && r.wikidata_qid !== person.qid) &&
        (discoveryNameKey(r.full_name) === key || (!!r.display_name && discoveryNameKey(r.display_name) === key)),
    ) ?? null
  )
}

type CrmPayload = Omit<CreateCandidateInput, "status"> & { qid: string | null }

/** The CRM fields a discovery result carries over. Pure. */
export function crmPayloadFromDiscovery(rec: DiscoveryCandidateRecord): CrmPayload | null {
  const name = (rec.display_name ?? rec.proposed_name ?? "").trim()
  if (!name) return null
  const v2 = ((rec.platform_signals as { v2?: Record<string, unknown> } | null)?.v2 ?? {}) as Record<
    string,
    unknown
  >
  const social = (v2.social ?? {}) as Record<string, string | null>
  const links: NonNullable<CreateCandidateInput["social_links"]> = []
  if (social.x) links.push({ platform: "x", url: social.x, is_primary: true })
  if (social.instagram) links.push({ platform: "instagram", url: social.instagram })
  if (social.linkedin) links.push({ platform: "linkedin", url: social.linkedin })
  if (social.youtube_channel) links.push({ platform: "youtube", url: social.youtube_channel })
  for (const ev of rec.evidence_urls.slice(0, 3)) {
    if (ev?.url) links.push({ platform: "website", url: ev.url })
  }
  const occupations = Array.isArray(v2.occupations) ? (v2.occupations as string[]) : []
  return {
    full_name: name,
    category: rec.proposed_role ?? occupations[0] ?? null,
    country: (v2.nationality as string | null) ?? rec.proposed_country ?? null,
    bio: (v2.why as string | null) ?? rec.general_rationale ?? rec.topic_fit_rationale ?? null,
    source_type: "discovery_v2",
    source_note: rec.topic_fit_rationale ?? rec.general_rationale ?? null,
    social_links: links,
    // Persisted since 2026-09-28 only for a CONFIDENT Wikidata match.
    qid: typeof v2.qid === "string" && v2.qid ? v2.qid : null,
  }
}

export type UpsertCrmResult =
  | {
      candidateId: string
      /** false = an existing record for this person was updated instead. */
      created: boolean
      conflict?: undefined
    }
  | {
      candidateId: string
      created: false
      /**
       * The person is already nominated for a DIFFERENT episode. Nothing was
       * written — re-pointing someone the team is already casting for
       * another episode is a decision, not a side effect of a click.
       */
      conflict: { otherEirId: string }
    }

/** One upsert at a time — a double click must not create the person twice. */
const CRM_UPSERT_LOCK = "crm:upsert-from-discovery"

/**
 * Create the CRM candidate for a discovery result, or update the one that
 * already exists for this person. `eirId` (from «رشّحه لهالحلقة») is written
 * to `target_eir_id` on either path. On update only EMPTY fields are filled
 * and only new link URLs are added — nothing the team typed is overwritten.
 */
export async function upsertCrmCandidateFromDiscovery(
  rec: DiscoveryCandidateRecord,
  opts: { actorId: string; eirId?: string | null },
): Promise<UpsertCrmResult> {
  if (!db) throw new Error("قاعدة البيانات غير متوفرة")
  const payload = crmPayloadFromDiscovery(rec)
  if (!payload) throw new Error("لا اسم للمرشّح")
  const d = db

  // Serialize: a transaction-scoped advisory lock held across look-up +
  // write. Two concurrent clicks both used to miss the (not yet inserted)
  // row and both insert. The insert inside commits before the lock is
  // released, so the second caller's look-up sees it and updates instead.
  return d.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${CRM_UPSERT_LOCK}))`)
    return upsertLocked(tx, rec, payload, opts)
  })
}

type Tx = Parameters<Parameters<NonNullable<typeof db>["transaction"]>[0]>[0]

async function upsertLocked(
  tx: Tx,
  rec: DiscoveryCandidateRecord,
  payload: CrmPayload,
  opts: { actorId: string; eirId?: string | null },
): Promise<UpsertCrmResult> {
  const rows = await tx
    .select({
      id: guestCandidates.id,
      full_name: guestCandidates.full_name,
      display_name: guestCandidates.display_name,
      wikidata_qid: guestCandidates.wikidata_qid,
      category: guestCandidates.category,
      country: guestCandidates.country,
      bio: guestCandidates.bio,
      source_note: guestCandidates.source_note,
      target_eir_id: guestCandidates.target_eir_id,
    })
    .from(guestCandidates)
    .where(isNull(guestCandidates.deleted_at))
  const match = findCrmMatch(rows, { name: payload.full_name, qid: payload.qid })

  if (match) {
    const full = match
    if (opts.eirId && full.target_eir_id && full.target_eir_id !== opts.eirId) {
      return { candidateId: full.id, created: false, conflict: { otherEirId: full.target_eir_id } }
    }
    await tx
      .update(guestCandidates)
      .set({
        category: full.category || payload.category || null,
        country: full.country || payload.country || null,
        bio: full.bio || payload.bio || null,
        source_note: full.source_note || payload.source_note || null,
        wikidata_qid: full.wikidata_qid || payload.qid,
        ...(opts.eirId ? { target_eir_id: opts.eirId } : {}),
        updated_at: new Date(),
      })
      .where(eq(guestCandidates.id, match.id))

    const existingLinks = await tx
      .select({ url: guestCandidateSocialLinks.url })
      .from(guestCandidateSocialLinks)
      .where(eq(guestCandidateSocialLinks.candidate_id, match.id))
    const have = new Set(existingLinks.map((l) => l.url))
    const fresh = (payload.social_links ?? []).filter((l) => !have.has(l.url))
    if (fresh.length > 0) {
      await tx.insert(guestCandidateSocialLinks).values(
        fresh.map((l) => ({
          candidate_id: match.id,
          platform: l.platform,
          url: l.url,
          label: l.label ?? null,
          is_primary: false,
          source: "discovery_v2",
        })),
      )
    }
    return { candidateId: match.id, created: false }
  }

  const { qid, ...input } = payload
  const created = await createCandidate(
    {
      ...input,
      status: "shortlisted",
      wikidata_qid: qid,
      target_eir_id: opts.eirId ?? null,
    },
    opts.actorId,
    // Same connection as the lock — a second pooled connection could wait
    // on a pool the waiting caller is holding.
    tx,
  )
  return { candidateId: created.id, created: true }
}

/** CRM candidates nominated for this episode that are not deleted. */
export async function listCandidatesNominatedForEir(
  eirId: string,
): Promise<Array<{ id: string; full_name: string; status: string }>> {
  if (!db) return []
  return db
    .select({ id: guestCandidates.id, full_name: guestCandidates.full_name, status: guestCandidates.status })
    .from(guestCandidates)
    .where(and(eq(guestCandidates.target_eir_id, eirId), isNull(guestCandidates.deleted_at)))
}
