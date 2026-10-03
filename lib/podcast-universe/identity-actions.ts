/**
 * Audited identity corrections (B16). Every action writes its change AND a
 * `podcast_person_events` row in ONE transaction — no correction exists
 * without its audit trail. No row is ever deleted: a wrong appearance is
 * `rejected` (unlinked), a duplicate person is `merged_into_person_id`.
 *
 * Manual nationality/gender decisions carry basis `manual`; the automatic
 * resolver never overwrites them.
 */
import { and, eq, inArray, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  guestCandidates,
  guests,
  podcastGuestAppearances,
  podcastPeople,
  podcastPersonAliases,
  podcastPersonEvents,
  PODCAST_EVIDENCE_STATUSES,
  PODCAST_GENDER_MARKERS,
  type PodcastEvidenceStatus,
  type PodcastGenderMarker,
} from "@/lib/db/schema"
import { normalizeNameKey } from "./normalize"
import { resolvePeople } from "./people"

export type ActionOutcome = { ok: true; message: string; personId?: string } | { ok: false; error: string }

type Tx = Parameters<Parameters<NonNullable<typeof db>["transaction"]>[0]>[0]

async function audit(tx: Tx, personId: string, action: string, actor: string, before: unknown, after: unknown, note?: string | null) {
  await tx.insert(podcastPersonEvents).values({
    person_id: personId,
    action,
    actor_id: actor,
    before_state: (before ?? null) as Record<string, unknown> | null,
    after_state: (after ?? null) as Record<string, unknown> | null,
    note: note?.trim() || null,
  })
}

async function lockPerson(tx: Tx, id: string) {
  const [p] = await tx.select().from(podcastPeople).where(eq(podcastPeople.id, id)).for("update")
  return p ?? null
}

export async function addAlias(personId: string, alias: string, actor: string): Promise<ActionOutcome> {
  const clean = alias.trim()
  const key = normalizeNameKey(clean)
  if (!key) return { ok: false, error: "الاسم البديل فارغ" }
  return db!.transaction(async (tx) => {
    const p = await lockPerson(tx, personId)
    if (!p) return { ok: false, error: "الشخص غير موجود" }
    const ins = await tx
      .insert(podcastPersonAliases)
      .values({ person_id: personId, alias: clean, normalized_alias: key, source: "manual" })
      .onConflictDoNothing()
      .returning({ id: podcastPersonAliases.id })
    if (!ins[0]) return { ok: false, error: "هذا الاسم البديل موجود" }
    await audit(tx, personId, "add_alias", actor, null, { alias: clean })
    return { ok: true, message: "أُضيف الاسم البديل" }
  })
}

export async function unlinkAppearance(appearanceId: string, note: string, actor: string): Promise<ActionOutcome> {
  if (!note.trim()) return { ok: false, error: "اكتب سبب الفصل" }
  const out = await db!.transaction(async (tx): Promise<ActionOutcome> => {
    const [ap] = await tx.select().from(podcastGuestAppearances).where(eq(podcastGuestAppearances.id, appearanceId)).for("update")
    if (!ap) return { ok: false, error: "الظهور غير موجود" }
    if (ap.verification_status === "rejected") return { ok: false, error: "الظهور مفصول مسبقاً" }
    await tx
      .update(podcastGuestAppearances)
      .set({ verification_status: "rejected", updated_at: new Date() })
      .where(eq(podcastGuestAppearances.id, appearanceId))
    await audit(tx, ap.person_id, "unlink_appearance", actor, { appearance_id: ap.id, status: ap.verification_status }, { status: "rejected" }, note)
    return { ok: true, message: "فُصل الظهور", personId: ap.person_id }
  })
  if (out.ok && out.personId) await resolvePeople([out.personId], actor)
  return out
}

/** Merge `sourceId` INTO `targetId` (a verified duplicate). The source row stays, marked merged. */
export async function mergePeople(sourceId: string, targetId: string, note: string, actor: string): Promise<ActionOutcome> {
  if (sourceId === targetId) return { ok: false, error: "لا يمكن دمج الشخص بنفسه" }
  if (!note.trim()) return { ok: false, error: "اكتب دليل أن الاثنين نفس الشخص" }
  const out = await db!.transaction(async (tx): Promise<ActionOutcome> => {
    // Lock in a stable order to avoid deadlocks between two opposite merges.
    const [a, b] = [sourceId, targetId].sort()
    const pa = await lockPerson(tx, a)
    const pb = await lockPerson(tx, b)
    const source = a === sourceId ? pa : pb
    const target = a === targetId ? pa : pb
    if (!source || !target) return { ok: false, error: "أحد الشخصين غير موجود" }
    if (source.merged_into_person_id || target.merged_into_person_id) return { ok: false, error: "أحد الشخصين مدموج مسبقاً" }

    const moved: string[] = []
    const shadowed: string[] = []
    const apps = await tx.select().from(podcastGuestAppearances).where(eq(podcastGuestAppearances.person_id, sourceId))
    for (const ap of apps) {
      const clash = await tx
        .select({ id: podcastGuestAppearances.id })
        .from(podcastGuestAppearances)
        .where(and(eq(podcastGuestAppearances.person_id, targetId), eq(podcastGuestAppearances.episode_id, ap.episode_id)))
      if (clash[0]) {
        // Both already appear on this episode — keep the target's, unlink the source's.
        await tx.update(podcastGuestAppearances).set({ verification_status: "rejected", updated_at: new Date() }).where(eq(podcastGuestAppearances.id, ap.id))
        shadowed.push(ap.id)
      } else {
        await tx.update(podcastGuestAppearances).set({ person_id: targetId, updated_at: new Date() }).where(eq(podcastGuestAppearances.id, ap.id))
        moved.push(ap.id)
      }
    }
    await tx.execute(sql`
      INSERT INTO podcast_person_aliases (person_id, alias, normalized_alias, source)
      SELECT ${targetId}::uuid, alias, normalized_alias, source FROM podcast_person_aliases WHERE person_id = ${sourceId}::uuid
      ON CONFLICT (person_id, normalized_alias) DO NOTHING
    `)
    await tx
      .insert(podcastPersonAliases)
      .values({ person_id: targetId, alias: source.canonical_name, normalized_alias: source.normalized_name_key, source: "verification" })
      .onConflictDoNothing()
    await tx
      .update(podcastPeople)
      .set({ merged_into_person_id: targetId, needs_identity_review: false, updated_at: new Date() })
      .where(eq(podcastPeople.id, sourceId))
    await tx
      .update(podcastPeople)
      .set({
        khat_guest_id: target.khat_guest_id ?? source.khat_guest_id,
        khat_guest_candidate_id: target.khat_guest_candidate_id ?? source.khat_guest_candidate_id,
        wikidata_id: target.wikidata_id ?? source.wikidata_id,
        first_seen_at: source.first_seen_at < target.first_seen_at ? source.first_seen_at : target.first_seen_at,
        updated_at: new Date(),
      })
      .where(eq(podcastPeople.id, targetId))
    await audit(tx, sourceId, "merged_into", actor, { id: sourceId }, { merged_into: targetId, moved, shadowed }, note)
    await audit(tx, targetId, "merged_from", actor, null, { merged_from: sourceId, moved, shadowed }, note)
    return { ok: true, message: `دُمج — نُقل ${moved.length} ظهور`, personId: targetId }
  })
  if (out.ok) await resolvePeople([targetId], actor)
  return out
}

/** Move the chosen appearances of a person to a NEW person (a mistaken identity). */
export async function splitPerson(personId: string, appearanceIds: string[], newName: string, note: string, actor: string): Promise<ActionOutcome> {
  if (appearanceIds.length === 0) return { ok: false, error: "اختر الظهورات التي تخص شخصاً آخر" }
  if (!note.trim()) return { ok: false, error: "اكتب سبب الفصل" }
  const out = await db!.transaction(async (tx): Promise<ActionOutcome> => {
    const p = await lockPerson(tx, personId)
    if (!p) return { ok: false, error: "الشخص غير موجود" }
    const apps = await tx
      .select()
      .from(podcastGuestAppearances)
      .where(and(eq(podcastGuestAppearances.person_id, personId), inArray(podcastGuestAppearances.id, appearanceIds)))
    if (apps.length !== appearanceIds.length) return { ok: false, error: "بعض الظهورات لا تخص هذا الشخص" }
    const total = await tx.select({ id: podcastGuestAppearances.id }).from(podcastGuestAppearances).where(eq(podcastGuestAppearances.person_id, personId))
    if (total.length === apps.length) return { ok: false, error: "لا يمكن نقل كل الظهورات — استخدم تعديل الهوية بدلاً من ذلك" }
    const name = newName.trim() || apps[0].display_name || p.canonical_name
    const [np] = await tx
      .insert(podcastPeople)
      .values({ canonical_name: name, normalized_name_key: normalizeNameKey(name), needs_identity_review: true, identity_notes: `split from ${personId}` })
      .returning({ id: podcastPeople.id })
    await tx.update(podcastGuestAppearances).set({ person_id: np.id, updated_at: new Date() }).where(inArray(podcastGuestAppearances.id, appearanceIds))
    await tx.insert(podcastPersonAliases).values({ person_id: np.id, alias: name, normalized_alias: normalizeNameKey(name), source: "manual" }).onConflictDoNothing()
    await audit(tx, personId, "split_out", actor, { appearances: appearanceIds }, { new_person_id: np.id }, note)
    await audit(tx, np.id, "split_from", actor, { from_person_id: personId }, { appearances: appearanceIds }, note)
    return { ok: true, message: "فُصلت الظهورات إلى شخص جديد", personId: np.id }
  })
  if (out.ok && out.personId) await resolvePeople([personId, out.personId], actor)
  return out
}

export async function linkKhatGuest(personId: string, guestId: string | null, actor: string): Promise<ActionOutcome> {
  const out = await db!.transaction(async (tx): Promise<ActionOutcome> => {
    const p = await lockPerson(tx, personId)
    if (!p) return { ok: false, error: "الشخص غير موجود" }
    if (guestId) {
      const [g] = await tx.select({ id: guests.id }).from(guests).where(eq(guests.id, guestId))
      if (!g) return { ok: false, error: "ضيف خط غير موجود" }
    }
    await tx.update(podcastPeople).set({ khat_guest_id: guestId, updated_at: new Date() }).where(eq(podcastPeople.id, personId))
    await audit(tx, personId, guestId ? "link_khat_guest" : "unlink_khat_guest", actor, { khat_guest_id: p.khat_guest_id }, { khat_guest_id: guestId })
    return { ok: true, message: guestId ? "رُبط بضيف خط" : "أُلغي الربط" }
  })
  if (out.ok) await resolvePeople([personId], actor)
  return out
}

export async function linkGuestCandidate(personId: string, candidateId: string | null, actor: string): Promise<ActionOutcome> {
  const out = await db!.transaction(async (tx): Promise<ActionOutcome> => {
    const p = await lockPerson(tx, personId)
    if (!p) return { ok: false, error: "الشخص غير موجود" }
    if (candidateId) {
      const [c] = await tx.select({ id: guestCandidates.id }).from(guestCandidates).where(eq(guestCandidates.id, candidateId))
      if (!c) return { ok: false, error: "المرشح غير موجود" }
    }
    await tx.update(podcastPeople).set({ khat_guest_candidate_id: candidateId, updated_at: new Date() }).where(eq(podcastPeople.id, personId))
    await audit(tx, personId, candidateId ? "link_candidate" : "unlink_candidate", actor, { khat_guest_candidate_id: p.khat_guest_candidate_id }, { khat_guest_candidate_id: candidateId })
    return { ok: true, message: candidateId ? "رُبط بالمرشح" : "أُلغي الربط" }
  })
  if (out.ok) await resolvePeople([personId], actor)
  return out
}

export async function setNationality(personId: string, code: string | null, status: PodcastEvidenceStatus, note: string, actor: string): Promise<ActionOutcome> {
  if (!(PODCAST_EVIDENCE_STATUSES as readonly string[]).includes(status)) return { ok: false, error: "حالة غير معروفة" }
  const cc = code ? code.trim().toUpperCase() : null
  if (cc && !/^[A-Z]{2}$/.test(cc)) return { ok: false, error: "رمز الدولة حرفان (مثل KW)" }
  if ((status === "verified" || status === "probable") && !cc) return { ok: false, error: "حدد الدولة" }
  if (status === "verified" && !note.trim()) return { ok: false, error: "التأكيد يحتاج مصدراً مكتوباً" }
  return db!.transaction(async (tx) => {
    const p = await lockPerson(tx, personId)
    if (!p) return { ok: false, error: "الشخص غير موجود" }
    // A verified decision from the person page cites a written source.
    const after = {
      nationality_code: cc,
      nationality_status: status,
      nationality_basis: "manual" as const,
      nationality_verification_method: status === "verified" ? ("source_evidence" as const) : null,
    }
    await tx.update(podcastPeople).set({ ...after, last_verified_at: new Date(), updated_at: new Date() }).where(eq(podcastPeople.id, personId))
    await audit(
      tx,
      personId,
      "set_nationality",
      actor,
      { nationality_code: p.nationality_code, nationality_status: p.nationality_status, nationality_basis: p.nationality_basis, nationality_verification_method: p.nationality_verification_method },
      after,
      note,
    )
    return { ok: true, message: "حُفظت الجنسية" }
  })
}

export async function setGender(personId: string, marker: PodcastGenderMarker, status: PodcastEvidenceStatus, note: string, actor: string): Promise<ActionOutcome> {
  if (!(PODCAST_GENDER_MARKERS as readonly string[]).includes(marker)) return { ok: false, error: "قيمة غير معروفة" }
  if (!(PODCAST_EVIDENCE_STATUSES as readonly string[]).includes(status)) return { ok: false, error: "حالة غير معروفة" }
  if (status === "verified" && (marker === "unknown" || !note.trim())) return { ok: false, error: "التأكيد يحتاج قيمة ومصدراً مكتوباً" }
  return db!.transaction(async (tx) => {
    const p = await lockPerson(tx, personId)
    if (!p) return { ok: false, error: "الشخص غير موجود" }
    const after = { gender_marker: marker, gender_status: status, gender_basis: "manual" as const }
    await tx.update(podcastPeople).set({ ...after, last_verified_at: new Date(), updated_at: new Date() }).where(eq(podcastPeople.id, personId))
    await audit(tx, personId, "set_gender", actor, { gender_marker: p.gender_marker, gender_status: p.gender_status, gender_basis: p.gender_basis }, after, note)
    return { ok: true, message: "حُفظ الجنس" }
  })
}

export async function markReviewed(personId: string, note: string, actor: string): Promise<ActionOutcome> {
  if (!note.trim()) return { ok: false, error: "اكتب نتيجة المراجعة" }
  return db!.transaction(async (tx) => {
    const p = await lockPerson(tx, personId)
    if (!p) return { ok: false, error: "الشخص غير موجود" }
    await tx.update(podcastPeople).set({ needs_identity_review: false, last_verified_at: new Date(), updated_at: new Date() }).where(eq(podcastPeople.id, personId))
    await audit(tx, personId, "mark_reviewed", actor, { needs_identity_review: p.needs_identity_review }, { needs_identity_review: false }, note)
    return { ok: true, message: "عُلّمت كمراجَعة" }
  })
}

// ─── Nationality review queue (M1 closeout addendum) ─────────────────────

export const NATIONALITY_REVIEW_DECISIONS = ["kuwaiti", "not_kuwaiti", "unsure"] as const
export type NationalityReviewDecision = (typeof NATIONALITY_REVIEW_DECISIONS)[number]

/**
 * One editor decision from «مراجعة الجنسية». Always audited
 * (`nationality_review_<decision>`), in the same transaction as the change.
 *   kuwaiti     → KW, VERIFIED, basis manual, method manual_editorial
 *   not_kuwaiti → code null, UNKNOWN, basis manual (a human decided; the
 *                 resolver will never re-derive it, and the queue drops it).
 *                 There is no "not X" status, so the decision itself lives in
 *                 the audit row.
 *   unsure      → NOTHING changes on the person; only the audit row is written.
 * Kuwait context (kuwait-context.ts) is only the reason a person is SHOWN
 * here; it never sets anything.
 */
export async function reviewNationality(
  personId: string,
  decision: NationalityReviewDecision,
  note: string,
  actor: string,
): Promise<ActionOutcome> {
  if (!(NATIONALITY_REVIEW_DECISIONS as readonly string[]).includes(decision)) return { ok: false, error: "قرار غير معروف" }
  return db!.transaction(async (tx) => {
    const p = await lockPerson(tx, personId)
    if (!p) return { ok: false, error: "الشخص غير موجود" }
    if (p.merged_into_person_id) return { ok: false, error: "سجل مدموج" }
    const before = {
      nationality_code: p.nationality_code,
      nationality_status: p.nationality_status,
      nationality_basis: p.nationality_basis,
      nationality_verification_method: p.nationality_verification_method,
    }
    let after: Record<string, unknown> = before
    if (decision === "kuwaiti") {
      after = {
        nationality_code: "KW",
        nationality_status: "verified",
        nationality_basis: "manual",
        nationality_verification_method: "manual_editorial",
      }
    } else if (decision === "not_kuwaiti") {
      after = { nationality_code: null, nationality_status: "unknown", nationality_basis: "manual", nationality_verification_method: null }
    }
    if (decision !== "unsure") {
      await tx
        .update(podcastPeople)
        .set({ ...(after as Partial<typeof podcastPeople.$inferInsert>), last_verified_at: new Date(), updated_at: new Date() })
        .where(eq(podcastPeople.id, personId))
    }
    await audit(tx, personId, `nationality_review_${decision}`, actor, before, decision === "unsure" ? null : after, note)
    return {
      ok: true,
      message: decision === "kuwaiti" ? "سُجّل: كويتي (قرار تحريري)" : decision === "not_kuwaiti" ? "سُجّل: غير كويتي" : "سُجّل: غير متأكد — بلا تغيير",
    }
  })
}
