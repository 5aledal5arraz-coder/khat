/**
 * Person persistence: attach a validated guest to a person (B8/B9), and the
 * deterministic `person.resolve` pass (B10).
 *
 * All of it runs inside the caller's transaction where one is given, so an
 * episode's appearances and its `succeeded` status land together or not at all.
 */
import { and, eq, inArray, isNull, notInArray, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  guestCandidates,
  podcastEpisodes,
  podcastGuestAppearances,
  podcastPeople,
  podcastPersonAliases,
  podcastPersonEvents,
  INACTIVE_APPEARANCE_STATUSES,
} from "@/lib/db/schema"
import { derivePersonEvidence, type PersonEvidenceState } from "./evidence"
import { decideIdentityLink, type ExistingPerson } from "./identity"
import { normalizeNameKey } from "./normalize"
import type { ValidGuest } from "./extraction/validate"
import { geographyOfNationality } from "@/lib/discovery-v2/story-evidence"

type Tx = Parameters<Parameters<NonNullable<typeof db>["transaction"]>[0]>[0]
type Executor = NonNullable<typeof db> | Tx

export interface AttachResult {
  personId: string
  /** The appearance row this guest now maps to (new or reproduced). */
  appearanceId: string
  created: boolean
  review: boolean
  rule: string
}

async function loadNamesakes(ex: Executor, nameKey: string): Promise<ExistingPerson[]> {
  const people = await ex
    .select({
      id: podcastPeople.id,
      nameKey: podcastPeople.normalized_name_key,
      nationalityCode: podcastPeople.nationality_code,
      genderMarker: podcastPeople.gender_marker,
    })
    .from(podcastPeople)
    .where(and(eq(podcastPeople.normalized_name_key, nameKey), isNull(podcastPeople.merged_into_person_id)))
  if (people.length === 0) return []
  const apps = await ex
    .select({
      personId: podcastGuestAppearances.person_id,
      channelId: podcastEpisodes.channel_id,
      role: podcastGuestAppearances.role_text,
      nationalityCode: podcastGuestAppearances.nationality_claim_code,
      gender: podcastGuestAppearances.gender_signal,
    })
    .from(podcastGuestAppearances)
    .innerJoin(podcastEpisodes, eq(podcastEpisodes.id, podcastGuestAppearances.episode_id))
    .where(
      and(
        inArray(podcastGuestAppearances.person_id, people.map((p) => p.id)),
        notInArray(podcastGuestAppearances.verification_status, [...INACTIVE_APPEARANCE_STATUSES]),
      ),
    )
  return people.map((p) => ({
    ...p,
    appearances: apps.filter((a) => a.personId === p.id),
  }))
}

/**
 * Attach one validated guest of one episode. Idempotent: if this episode
 * already has an appearance for a person with the same name key, that person
 * is reused and nothing new is written.
 */
export async function attachGuest(
  ex: Executor,
  input: { episodeId: string; channelId: string; guest: ValidGuest; topicHint: string | null; aiRunId: string | null; actor: string },
): Promise<AttachResult> {
  const { guest } = input
  const nameKey = normalizeNameKey(guest.display_name)

  const already = await ex
    .select({
      personId: podcastGuestAppearances.person_id,
      appearanceId: podcastGuestAppearances.id,
      status: podcastGuestAppearances.verification_status,
    })
    .from(podcastGuestAppearances)
    .innerJoin(podcastPeople, eq(podcastPeople.id, podcastGuestAppearances.person_id))
    .where(and(eq(podcastGuestAppearances.episode_id, input.episodeId), eq(podcastPeople.normalized_name_key, nameKey)))
    .limit(1)
  if (already[0]) {
    // Re-extraction (Addendum 2 e) may now carry a VALIDATED claim the first
    // pass dropped. Fill in only what is missing — never overwrite a claim.
    await ex
      .update(podcastGuestAppearances)
      .set({
        nationality_claim_code: sql`COALESCE(${podcastGuestAppearances.nationality_claim_code}, ${guest.nationality_claim_code})`,
        nationality_claim_text: sql`CASE WHEN ${podcastGuestAppearances.nationality_claim_code} IS NULL THEN ${guest.nationality_claim_text} ELSE ${podcastGuestAppearances.nationality_claim_text} END`,
        gender_signal: sql`CASE WHEN ${podcastGuestAppearances.gender_signal} = 'unknown' THEN ${guest.gender_signal} ELSE ${podcastGuestAppearances.gender_signal} END`,
        gender_evidence_text: sql`CASE WHEN ${podcastGuestAppearances.gender_signal} = 'unknown' THEN ${guest.gender_evidence_text} ELSE ${podcastGuestAppearances.gender_evidence_text} END`,
        updated_at: new Date(),
      })
      .where(eq(podcastGuestAppearances.id, already[0].appearanceId))
    await restoreIfSuperseded(ex, already[0].appearanceId, already[0].personId, already[0].status, input.actor)
    return { personId: already[0].personId, appearanceId: already[0].appearanceId, created: false, review: false, rule: "already_attached" }
  }

  const namesakes = await loadNamesakes(ex, nameKey)
  const decision = decideIdentityLink(
    {
      nameKey,
      channelId: input.channelId,
      role: guest.role_text,
      nationalityCode: guest.nationality_claim_code,
      gender: guest.gender_signal,
    },
    namesakes,
  )

  let personId: string
  let created = false
  let review = false
  let rule: string
  if (decision.action === "link") {
    personId = decision.personId
    rule = decision.rule
    await ex
      .update(podcastPeople)
      .set({ last_seen_at: new Date(), updated_at: new Date() })
      .where(eq(podcastPeople.id, personId))
  } else {
    review = decision.review
    rule = decision.review ? `new_person_review: ${decision.reason}` : "new_person"
    const [p] = await ex
      .insert(podcastPeople)
      .values({
        canonical_name: guest.display_name,
        normalized_name_key: nameKey,
        needs_identity_review: decision.review,
        identity_notes: decision.review ? `namesake: ${decision.reason}` : null,
      })
      .returning({ id: podcastPeople.id })
    personId = p.id
    created = true
    if (decision.review) {
      await ex
        .update(podcastPeople)
        .set({ needs_identity_review: true, updated_at: new Date() })
        .where(inArray(podcastPeople.id, decision.namesakeIds))
    }
    await ex.insert(podcastPersonEvents).values({
      person_id: personId,
      action: "created_from_extraction",
      actor_id: input.actor,
      after_state: { rule, episode_id: input.episodeId, namesakes: decision.review ? decision.namesakeIds : [] },
    })
  }

  await ex
    .insert(podcastPersonAliases)
    .values({ person_id: personId, alias: guest.display_name, normalized_alias: nameKey, source: "episode" })
    .onConflictDoNothing()

  const inserted = await ex
    .insert(podcastGuestAppearances)
    .values({
      person_id: personId,
      episode_id: input.episodeId,
      is_primary_guest: guest.is_primary_guest,
      role_text: guest.role_text,
      extraction_source: "metadata_ai",
      extraction_confidence: guest.confidence.toFixed(3),
      evidence_field: guest.evidence_field,
      evidence_text: guest.evidence_text,
      display_name: guest.display_name,
      nationality_claim_code: guest.nationality_claim_code,
      nationality_claim_text: guest.nationality_claim_text,
      gender_signal: guest.gender_signal,
      gender_evidence_text: guest.gender_evidence_text,
      topic_hint: input.topicHint,
      verification_status: review ? "review" : "extracted",
      ai_run_id: input.aiRunId,
    })
    .onConflictDoNothing()
    .returning({ id: podcastGuestAppearances.id })
  if (inserted[0]) return { personId, appearanceId: inserted[0].id, created, review, rule }
  // (person, episode) already had a row — e.g. a Case C link onto an earlier,
  // since-superseded appearance. Reuse it; bring it back if superseded.
  const [row] = await ex
    .select({ id: podcastGuestAppearances.id, status: podcastGuestAppearances.verification_status })
    .from(podcastGuestAppearances)
    .where(and(eq(podcastGuestAppearances.person_id, personId), eq(podcastGuestAppearances.episode_id, input.episodeId)))
  await restoreIfSuperseded(ex, row.id, personId, row.status, input.actor)
  return { personId, appearanceId: row.id, created, review, rule }
}

/**
 * A re-extraction that REPRODUCES a superseded appearance restores it
 * (audited). A `rejected` row — an operator's or a rule's decision — is never
 * revived by the model.
 */
async function restoreIfSuperseded(ex: Executor, appearanceId: string, personId: string, status: string, actor: string) {
  if (status !== "superseded") return
  await ex
    .update(podcastGuestAppearances)
    .set({ verification_status: "extracted", updated_at: new Date() })
    .where(eq(podcastGuestAppearances.id, appearanceId))
  await ex.insert(podcastPersonEvents).values({
    person_id: personId,
    action: "appearance_restored",
    actor_id: actor,
    before_state: { appearance_id: appearanceId, status: "superseded" },
    after_state: { status: "extracted" },
  })
}

/**
 * Re-extraction REPLACES (noura 2026-10-03): after an episode's new result is
 * persisted, every ACTIVE appearance on it that the new result did not
 * reproduce becomes `superseded` — never deleted — with one audit row each.
 * Returns the superseded rows (their people need a person.resolve pass).
 */
export async function supersedeUnreproduced(
  ex: Executor,
  episodeId: string,
  keepAppearanceIds: string[],
  actor: string,
  note: string,
): Promise<Array<{ id: string; person_id: string }>> {
  const stale = await ex
    .select({ id: podcastGuestAppearances.id, person_id: podcastGuestAppearances.person_id, display_name: podcastGuestAppearances.display_name, status: podcastGuestAppearances.verification_status })
    .from(podcastGuestAppearances)
    .where(
      and(
        eq(podcastGuestAppearances.episode_id, episodeId),
        notInArray(podcastGuestAppearances.verification_status, [...INACTIVE_APPEARANCE_STATUSES]),
        keepAppearanceIds.length > 0 ? notInArray(podcastGuestAppearances.id, keepAppearanceIds) : undefined,
      ),
    )
  for (const a of stale) {
    await ex
      .update(podcastGuestAppearances)
      .set({ verification_status: "superseded", updated_at: new Date() })
      .where(eq(podcastGuestAppearances.id, a.id))
    await ex.insert(podcastPersonEvents).values({
      person_id: a.person_id,
      action: "appearance_superseded",
      actor_id: actor,
      before_state: { appearance_id: a.id, episode_id: episodeId, display_name: a.display_name, status: a.status },
      after_state: { status: "superseded" },
      note,
    })
  }
  return stale.map((a) => ({ id: a.id, person_id: a.person_id }))
}

/** guest_candidates.country → ISO code, for an explicitly linked candidate (PROBABLE-grade only). */
function candidateCountryCode(country: string | null | undefined): string | null {
  const g = geographyOfNationality(country)
  if (g === "kuwait") return "KW"
  if (g === "saudi") return "SA"
  return null
}

function stateOf(p: typeof podcastPeople.$inferSelect): PersonEvidenceState {
  return {
    nationality_code: p.nationality_code,
    nationality_status: p.nationality_status,
    nationality_basis: p.nationality_basis,
    gender_marker: p.gender_marker,
    gender_status: p.gender_status,
    gender_basis: p.gender_basis,
  }
}

/**
 * B10 — deterministic resolution for a set of people: internal Khat link →
 * explicit metadata claims → status. No network, no AI. Writes an audit event
 * only when something changed. Returns how many people changed.
 */
export async function resolvePeople(personIds: string[], actor = "system:podcast.person.resolve"): Promise<number> {
  if (!db || personIds.length === 0) return 0
  let changed = 0
  for (const id of [...new Set(personIds)]) {
    await db.transaction(async (tx) => {
      const [p] = await tx.select().from(podcastPeople).where(eq(podcastPeople.id, id)).for("update")
      if (!p || p.merged_into_person_id) return
      const apps = await tx
        .select({
          nationality_claim_code: podcastGuestAppearances.nationality_claim_code,
          gender_signal: podcastGuestAppearances.gender_signal,
          verification_status: podcastGuestAppearances.verification_status,
        })
        .from(podcastGuestAppearances)
        .where(eq(podcastGuestAppearances.person_id, id))
      let candidate: { nationality_code: string | null } | null = null
      if (p.khat_guest_candidate_id) {
        const [c] = await tx
          .select({ country: guestCandidates.country })
          .from(guestCandidates)
          .where(eq(guestCandidates.id, p.khat_guest_candidate_id))
        const code = candidateCountryCode(c?.country)
        if (code) candidate = { nationality_code: code }
      }
      const before = stateOf(p)
      const after = derivePersonEvidence(before, apps, candidate)

      const namesakes = await tx.execute(sql`
        SELECT 1 FROM podcast_people
        WHERE normalized_name_key = ${p.normalized_name_key} AND id <> ${id} AND merged_into_person_id IS NULL
          -- a namesake an admin already reviewed past does not re-raise the flag
          AND (${p.last_verified_at ? p.last_verified_at.toISOString() : null}::timestamptz IS NULL
               OR created_at > ${p.last_verified_at ? p.last_verified_at.toISOString() : null}::timestamptz)
        LIMIT 1
      `)
      // Review is raised automatically, never cleared automatically.
      const review = p.needs_identity_review || namesakes.rows.length > 0 || after.nationality_status === "conflicted"

      const same =
        JSON.stringify(before) === JSON.stringify(after) && review === p.needs_identity_review
      if (same) return
      await tx
        .update(podcastPeople)
        .set({ ...after, needs_identity_review: review, updated_at: new Date() })
        .where(eq(podcastPeople.id, id))
      await tx.insert(podcastPersonEvents).values({
        person_id: id,
        action: "auto_resolve",
        actor_id: actor,
        before_state: { ...before, needs_identity_review: p.needs_identity_review },
        after_state: { ...after, needs_identity_review: review },
      })
      changed++
    })
  }
  return changed
}


export interface SettledEpisode {
  episode_id: string
  note: "host_only" | "no_active_guest"
}

/**
 * An episode marked `succeeded` whose appearances are ALL inactive (host-
 * excluded / rejected / superseded) has, in fact, no guest: it becomes
 * `no_guest` with a note — `host_only` when every one of those appearances
 * was a host exclusion — and each affected person gets an
 * `episode_marked_no_guest` audit row. Scope with `episodeIds`, or null for all.
 * `apply: false` only reports.
 */
export async function settleGuestlessEpisodes(
  ex: Executor,
  opts: { episodeIds: string[] | null; apply: boolean; actor: string },
): Promise<SettledEpisode[]> {
  if (opts.episodeIds && opts.episodeIds.length === 0) return []
  const scope = opts.episodeIds ? sql`AND e.id IN (${sql.join(opts.episodeIds.map((i) => sql`${i}::uuid`), sql`, `)})` : sql``
  const res = await ex.execute(sql`
    SELECT e.id AS episode_id,
           bool_and(EXISTS (
             SELECT 1 FROM podcast_person_events ev
             WHERE ev.action = 'host_excluded' AND ev.before_state->>'appearance_id' = a.id::text
           )) AS all_hosts,
           array_agg(DISTINCT a.person_id) AS people
    FROM podcast_episodes e
    JOIN podcast_guest_appearances a ON a.episode_id = e.id
    WHERE e.guest_extraction_status = 'succeeded' ${scope}
      AND NOT EXISTS (SELECT 1 FROM podcast_guest_appearances x
                      WHERE x.episode_id = e.id AND x.verification_status NOT IN ('rejected', 'superseded'))
    GROUP BY e.id
  `)
  const rows = res.rows as Array<{ episode_id: string; all_hosts: boolean; people: string[] }>
  const out: SettledEpisode[] = rows.map((r) => ({ episode_id: r.episode_id, note: r.all_hosts ? "host_only" : "no_active_guest" }))
  if (!opts.apply) return out
  for (const r of rows) {
    const note = r.all_hosts ? "host_only" : "no_active_guest"
    await ex.execute(sql`
      UPDATE podcast_episodes SET guest_extraction_status = 'no_guest', guest_extraction_note = ${note}, updated_at = now()
      WHERE id = ${r.episode_id}::uuid AND guest_extraction_status = 'succeeded'`)
    for (const personId of r.people) {
      await ex.insert(podcastPersonEvents).values({
        person_id: personId,
        action: "episode_marked_no_guest",
        actor_id: opts.actor,
        before_state: { episode_id: r.episode_id, guest_extraction_status: "succeeded" },
        after_state: { guest_extraction_status: "no_guest", note },
      })
    }
  }
  return out
}
