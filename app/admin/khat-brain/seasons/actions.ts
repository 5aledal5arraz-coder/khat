"use server"

/**
 * Khat Map v2 — Server Actions.
 *
 * The wizard's entire interaction surface. Every action:
 *   - gates on requireAdmin()
 *   - returns { success, data? | error } (never throws across the network)
 *   - calls the v2 engine / learning layers, never raw Drizzle
 *   - writes editorial signal via recordDecisionAndFingerprint so the
 *     learning layer stays fed
 *
 * NO v1 code is touched. v1's /admin/khat-map planner keeps working.
 */

import { eq, and, inArray, isNull } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import {
  khatMapSeasons,
  khatMapEpisodeCandidates,
  khatMapGuestCandidates,
  khatMapSeasonDecisions,
} from "@/lib/db/schema/khat-map"
import { requireAdmin, getAdminAuthUser } from "@/lib/api-utils"
import {
  createSeason,
  getSeasonById,
  patchSeasonControls,
  createEpisodeCandidate,
} from "@/lib/khat-map/core/queries"
import {
  generateBatch,
  generateGuestFirstCards,
  recordDecisionAndFingerprint,
  undoDecisionAndFingerprint,
} from "@/lib/khat-map/v2"
import {
  normalizeTitleTokens,
  jaccardSimilarity,
  TITLE_DEDUP_JACCARD_THRESHOLD,
} from "@/lib/khat-map/v2/title-similarity"
import { ensureEirForCandidate } from "@/lib/khat-brain"
import { getEpisodeCandidateById } from "@/lib/khat-map/core/queries"
import { AngleBankExhaustedError } from "@/lib/khat-map/v2/strict"
import {
  detectMissingRoles,
  prioritizeMissingRoles,
  type KhatMapMustIncludeRole,
} from "@/lib/khat-map/v2/completion"
import type { BatchResult, BatchCard } from "@/lib/khat-map/v2/types"
import { updateEpisodeCandidateStatus } from "@/lib/khat-map/core/queries"
import { recordDecision } from "@/lib/khat-map/learning/decisions"
import type {
  KhatMapV2Mode,
  KhatMapFeedbackReasonCategory,
  KhatMapEpisodeCandidate,
  KhatMapGuestCandidate,
  KhatMapEditorialControls,
  KhatMapEpisodeType,
  KhatMapTopicDomain,
} from "@/types/khat-map"

type Result<T> =
  | { success: true; data: T }
  | { success: false; error: string; code?: string }

// ─── 0. Bulk deletion ─────────────────────────────────────────────────────────

/**
 * Permanently delete one or more seasons and ALL their related data.
 *
 * A single hard DELETE on khat_map_seasons is sufficient: the foreign-key
 * graph is fully cascade-enforced at the database level. Deleting a season
 * row cascades to its episode candidates, guest candidates, season
 * decisions, topic fingerprints, user feedback, and editorial voice signals
 * (and their descendants). Cross-cutting records that merely reference a
 * season — ai_runs, discovery_runs, episode_intelligence_records,
 * hybrid_topic_generations, and the topic-bank last-used pointer — have
 * their season_id set to NULL instead, so episode/telemetry history
 * survives. No manual child cleanup or explicit delete ordering is needed.
 */
export async function deleteSeasonsBulkAction(
  seasonIds: string[],
): Promise<Result<{ deletedCount: number }>> {
  await requireAdmin()
  const user = await getAdminAuthUser()
  if (!user) return { success: false, error: "غير مصرح" }

  const ids = (Array.isArray(seasonIds) ? seasonIds : []).filter(
    (id): id is string => typeof id === "string" && id.length > 0,
  )
  if (ids.length === 0) {
    return { success: false, error: "لم يتم تحديد أي موسم للحذف" }
  }

  try {
    const deleted = await db!
      .delete(khatMapSeasons)
      .where(inArray(khatMapSeasons.id, ids))
      .returning({ id: khatMapSeasons.id })
    console.info(
      `[deleteSeasonsBulkAction] ${user.email} deleted ${deleted.length}/${ids.length} season(s)`,
    )
    revalidatePath("/admin/khat-brain/seasons")
    revalidatePath("/admin/khat-brain")
    return { success: true, data: { deletedCount: deleted.length } }
  } catch (err) {
    console.error("[deleteSeasonsBulkAction] failed:", err)
    return {
      success: false,
      error: (err as Error).message || "فشل حذف المواسم",
    }
  }
}

// ─── 1. Setup ────────────────────────────────────────────────────────────────

export async function createV2SeasonAction(input: {
  mode: KhatMapV2Mode
  episode_count: number
  name?: string
  editorial_controls?: KhatMapEditorialControls
}): Promise<Result<{ seasonId: string }>> {
  await requireAdmin()
  const user = await getAdminAuthUser()
  if (!user) return { success: false, error: "غير مصرح" }
  if (input.episode_count < 6 || input.episode_count > 20) {
    return { success: false, error: "عدد الحلقات يجب أن يكون بين 6 و 20" }
  }

  // Gender + nationality each accept a single category OR "both"
  // (all / any). All combinations are valid: the engine applies a filter
  // only when a specific category is chosen, and treats all/any as "no
  // restriction". Defaults (all/any) are intentional, so nothing to reject.

  try {
    const next_number = await nextSeasonNumber()
    const name =
      input.name?.trim() || `الموسم ${next_number} — خريطة ${modeLabel(input.mode)}`
    const season = await createSeason({
      name,
      season_number: next_number,
      target_episode_count: input.episode_count,
      created_by: user.id,
      editorial_controls: input.editorial_controls,
    })

    // Persist the v2 metadata directly — createSeason doesn't know these
    // wizard-specific columns. New seasons land in Phase A (`wizard_stage`
    // defaults to "topics" via the schema).
    await db!
      .update(khatMapSeasons)
      .set({
        v2_mode: input.mode,
        v2_episode_target: input.episode_count,
      })
      .where(eq(khatMapSeasons.id, season.id))

    revalidatePath("/admin/khat-brain/seasons/new")
    return { success: true, data: { seasonId: season.id } }
  } catch (e) {
    return { success: false, error: errorOf(e) }
  }
}

/**
 * Manual topic authoring. The operator writes an episode topic by hand; it is
 * created, approved, and recorded as an `accept` decision, so it counts toward
 * the season target and flows into the normal lock → Phase B path.
 *
 * Available in two modes:
 *   - `manual` — the whole season is hand-authored (AI off).
 *   - `guided` — the operator hand-seeds ~10% of topics, then the AI fills the
 *     rest (the seeds are passed to the generator as "already chosen — don't
 *     duplicate"). This is what makes Guided a real hybrid rather than 100% AI.
 */
export async function addManualTopicAction(input: {
  seasonId: string
  working_title: string
  episode_type: KhatMapEpisodeType
  topic_domain?: KhatMapTopicDomain
  hook?: string
  why_matters?: string
  why_now?: string
}): Promise<Result<{ topic: KhatMapEpisodeCandidate }>> {
  await requireAdmin()
  const user = await getAdminAuthUser()
  if (!user) return { success: false, error: "غير مصرح" }

  const title = input.working_title?.trim()
  if (!title) return { success: false, error: "عنوان الموضوع مطلوب" }
  if (!input.episode_type) return { success: false, error: "نوع الحلقة مطلوب" }

  const season = await getSeasonById(input.seasonId)
  if (!season) return { success: false, error: "الموسم غير موجود" }
  if (season.v2_mode !== "manual" && season.v2_mode !== "guided") {
    return {
      success: false,
      error: "الإضافة اليدوية متاحة في الوضعين «اليدوي» و«الموجّه» فقط",
    }
  }
  // Only while still authoring topics (Phase A). After the topics are locked,
  // adding more would desync the locked set from Phase B guest discovery.
  if (season.wizard_stage && season.wizard_stage !== "topics" && season.wizard_stage !== "setup") {
    return { success: false, error: "لا يمكن إضافة مواضيع بعد قفل المرحلة الأولى" }
  }

  try {
    const created = await createEpisodeCandidate({
      season_id: input.seasonId,
      working_title: title,
      episode_type: input.episode_type,
      topic_domain: input.topic_domain,
      hook: input.hook?.trim() || null,
      why_matters: input.why_matters?.trim() || null,
      why_now: input.why_now?.trim() || null,
    })
    const approved = await updateEpisodeCandidateStatus(created.id, "approved")
    // Record an "accept" decision — season progress counts decisions (not raw
    // candidate status), so without this the topic wouldn't count toward the
    // target and the "lock topics" CTA would stay disabled.
    await recordDecision({
      season_id: input.seasonId,
      admin_id: user.id,
      batch_index: 0,
      kind: "accept",
      target: "topic",
      topic_candidate_id: created.id,
    })
    revalidatePath(`/admin/khat-brain/seasons/${input.seasonId}`)
    return { success: true, data: { topic: approved ?? created } }
  } catch (err) {
    console.error("[addManualTopicAction]", err)
    return { success: false, error: err instanceof Error ? err.message : "فشل إضافة الموضوع" }
  }
}

/**
 * Remove a manually-authored topic (manual mode). Rejects the candidate so
 * it drops out of the approved set + season count, while staying recoverable
 * in the data. Only while topics are still being authored (Phase A).
 */
export async function removeManualTopicAction(input: {
  seasonId: string
  topicCandidateId: string
}): Promise<Result<{ ok: true }>> {
  await requireAdmin()
  const user = await getAdminAuthUser()
  if (!user) return { success: false, error: "غير مصرح" }

  const season = await getSeasonById(input.seasonId)
  if (!season) return { success: false, error: "الموسم غير موجود" }
  if (season.wizard_stage && season.wizard_stage !== "topics" && season.wizard_stage !== "setup") {
    return { success: false, error: "لا يمكن حذف المواضيع بعد قفل المرحلة الأولى" }
  }

  try {
    await updateEpisodeCandidateStatus(input.topicCandidateId, "rejected", "حُذف يدوياً")
    // Undo the matching accept decision so the season count drops back.
    await db!
      .update(khatMapSeasonDecisions)
      .set({ undone_at: new Date() })
      .where(and(
        eq(khatMapSeasonDecisions.topic_candidate_id, input.topicCandidateId),
        eq(khatMapSeasonDecisions.kind, "accept"),
        isNull(khatMapSeasonDecisions.undone_at),
      ))
    revalidatePath(`/admin/khat-brain/seasons/${input.seasonId}`)
    return { success: true, data: { ok: true } }
  } catch (err) {
    console.error("[removeManualTopicAction]", err)
    return { success: false, error: err instanceof Error ? err.message : "فشل حذف الموضوع" }
  }
}

/**
 * Patch the editorial-controls bundle on an existing season. Used by the
 * wizard's in-flight "edit controls" affordance (post-creation edits).
 */
export async function updateSeasonControlsAction(input: {
  seasonId: string
  controls: KhatMapEditorialControls
}): Promise<Result<{ ok: true }>> {
  await requireAdmin()
  const user = await getAdminAuthUser()
  if (!user) return { success: false, error: "غير مصرح" }
  try {
    const updated = await patchSeasonControls(input.seasonId, input.controls)
    if (!updated) return { success: false, error: "الموسم غير موجود" }
    revalidatePath(`/admin/khat-brain/seasons/${input.seasonId}`)
    return { success: true, data: { ok: true } }
  } catch (e) {
    return { success: false, error: errorOf(e) }
  }
}

/**
 * Phase A → Phase B transition. Stamps `wizard_stage = "topics_locked"` and
 * `topics_locked_at = now()` once the operator has approved every topic
 * for the season. The Phase B per-episode discovery UI gates on this
 * stage. Topics remain editable after locking — `editEpisodeAction`
 * stamps `discovery_stale_at` on the affected candidate so the operator
 * knows discovery needs to be re-run.
 */
export async function lockSeasonTopicsAction(input: {
  seasonId: string
}): Promise<Result<{ ok: true }>> {
  await requireAdmin()
  const user = await getAdminAuthUser()
  if (!user) return { success: false, error: "غير مصرح" }
  if (!db) return { success: false, error: "قاعدة البيانات غير متوفرة" }
  try {
    const season = await getSeasonById(input.seasonId)
    if (!season) return { success: false, error: "الموسم غير موجود" }
    if (season.wizard_stage === "topics_locked" || season.wizard_stage === "guests" || season.wizard_stage === "complete") {
      // Idempotent — no-op if already past Phase A.
      return { success: true, data: { ok: true } }
    }
    if (season.wizard_stage !== "topics") {
      return {
        success: false,
        error: `لا يمكن قفل المواضيع من المرحلة الحالية (${season.wizard_stage}).`,
      }
    }

    // Require AT LEAST one approved candidate before locking. The
    // operator is allowed to lock with fewer than `target_episode_count`
    // approvals if they want to ship a shorter season — we don't enforce
    // the target here, just non-empty.
    const approved = await db
      .select({ id: khatMapEpisodeCandidates.id })
      .from(khatMapEpisodeCandidates)
      .where(
        and(
          eq(khatMapEpisodeCandidates.season_id, input.seasonId),
          eq(khatMapEpisodeCandidates.status, "approved"),
        ),
      )
    if (approved.length === 0) {
      return {
        success: false,
        error: "اعتمد موضوعًا واحدًا على الأقل قبل قفل المواضيع.",
      }
    }

    await db
      .update(khatMapSeasons)
      .set({
        wizard_stage: "topics_locked",
        topics_locked_at: new Date(),
        updated_at: new Date(),
      })
      .where(eq(khatMapSeasons.id, input.seasonId))

    revalidatePath(`/admin/khat-brain/seasons/${input.seasonId}`)
    return { success: true, data: { ok: true } }
  } catch (e) {
    return { success: false, error: errorOf(e) }
  }
}

// ─── 1b. Phase B — per-episode guest discovery ──────────────────────────────

/**
 * Start a per-episode discovery run. Wraps the discovery action so the
 * seasons UI doesn't depend on the discovery folder directly.
 * Idempotent-friendly: kicks a fresh run every call; the operator gets
 * a new candidate pool each time. Stamps `discovery_stale_at = null`
 * on the episode candidate so any "discovery is stale" banner clears.
 */
export async function startGuestDiscoveryForEpisodeAction(input: {
  seasonId: string
  episodeCandidateId: string
  /**
   * Skip the "lock topics first" wizard-stage gate. Set by EIR-initiated
   * launches (startGuestDiscoveryForEirAction): an EIR is already a concrete
   * episode, so discovery is valid regardless of the season's wizard stage.
   */
  bypassStageGate?: boolean
}): Promise<Result<{ runId: string }>> {
  await requireAdmin()
  const user = await getAdminAuthUser()
  if (!user) return { success: false, error: "غير مصرح" }
  if (!db) return { success: false, error: "قاعدة البيانات غير متوفرة" }
  try {
    const season = await getSeasonById(input.seasonId)
    if (!season) return { success: false, error: "الموسم غير موجود" }
    if (
      !input.bypassStageGate &&
      season.wizard_stage !== "topics_locked" &&
      season.wizard_stage !== "guests" &&
      season.wizard_stage !== "complete"
    ) {
      return {
        success: false,
        error: "اقفل المواضيع أولًا قبل بدء البحث عن الضيوف.",
      }
    }

    // Guest Discovery v2 — name-first, Wikidata-anchored engine. We
    // derive a topic string from the episode candidate (working title +
    // topic domain + hook) and inherit the season's strict guest
    // filters (gender / nationality) so v2 ranks the right people.
    const [cand] = await db
      .select({
        working_title: khatMapEpisodeCandidates.working_title,
        topic_domain: khatMapEpisodeCandidates.topic_domain,
        hook: khatMapEpisodeCandidates.hook,
        why_matters: khatMapEpisodeCandidates.why_matters,
      })
      .from(khatMapEpisodeCandidates)
      .where(eq(khatMapEpisodeCandidates.id, input.episodeCandidateId))
      .limit(1)

    const topicParts: string[] = []
    if (cand?.working_title) topicParts.push(cand.working_title)
    if (cand?.topic_domain) topicParts.push(cand.topic_domain)
    if (cand?.hook) topicParts.push(cand.hook)
    if (cand?.why_matters) topicParts.push(cand.why_matters)
    const topic = (topicParts.join(" — ") || season.name || "ضيف الحلقة").slice(0, 600)

    const controls = season.editorial_controls as KhatMapEditorialControls | undefined
    const gf = controls?.guest_filters
    const gender = gf?.gender === "male" || gf?.gender === "female" ? gf.gender : null
    const nationality =
      gf?.nationality === "kuwaiti" || gf?.nationality === "non_kuwaiti"
        ? gf.nationality
        : null

    const { startV2DiscoveryAction } = await import("@/app/admin/discovery-v2/actions")
    const v2 = await startV2DiscoveryAction({
      topic,
      gender,
      nationality,
      taste: "balanced",
      seasonId: input.seasonId,
      episodeCandidateId: input.episodeCandidateId,
    })
    if (!v2.success || !v2.runId) {
      return { success: false, error: v2.error ?? "تعذّر بدء البحث" }
    }
    const res = { success: true as const, data: { runId: v2.runId } }

    // Move the season into the active "guests" stage on the first run
    // and stamp `guests_started_at` for analytics. Also clear the
    // stale-discovery flag for this episode candidate.
    const patch: Partial<typeof khatMapSeasons.$inferInsert> = {
      updated_at: new Date(),
    }
    if (season.wizard_stage === "topics_locked") {
      patch.wizard_stage = "guests"
      patch.guests_started_at = new Date()
    }
    if (Object.keys(patch).length > 1 || patch.wizard_stage) {
      await db
        .update(khatMapSeasons)
        .set(patch)
        .where(eq(khatMapSeasons.id, input.seasonId))
    }
    await db
      .update(khatMapEpisodeCandidates)
      .set({ discovery_stale_at: null, updated_at: new Date() })
      .where(eq(khatMapEpisodeCandidates.id, input.episodeCandidateId))

    revalidatePath(`/admin/khat-brain/seasons/${input.seasonId}`)
    return { success: true, data: { runId: res.data.runId } }
  } catch (e) {
    return { success: false, error: errorOf(e) }
  }
}

/**
 * Phase B — load discovery candidates targeted at a specific episode.
 * The Phase B panel calls this when the operator opens an episode.
 * Returns candidates from the most recent run for that episode that
 * survived the verifier filter (i.e. status === "proposed"), ordered
 * by composite_score (fallback to topic_fit_score, then to created_at).
 */
export async function listDiscoveryCandidatesForEpisodeAction(input: {
  episodeCandidateId: string
  limit?: number
}): Promise<
  Result<{
    candidates: Array<{
      id: string
      proposed_name: string | null
      proposed_role: string | null
      proposed_country: string | null
      general_rationale: string | null
      topic_fit_rationale: string | null
      topic_fit_score: number | null
      composite_score: number | null
      social_links: import("@/lib/db/schema/discovery").DiscoverySocialLinks | null
      status: import("@/lib/db/schema/discovery").DiscoveryCandidateStatus
    }>
  }>
> {
  await requireAdmin()
  if (!db) return { success: false, error: "قاعدة البيانات غير متوفرة" }
  try {
    const { listCandidatesForEpisode } = await import("@/lib/discovery/candidates-by-episode")
    const cands = await listCandidatesForEpisode({
      episodeCandidateId: input.episodeCandidateId,
      limit: input.limit ?? 8,
    })
    return {
      success: true,
      data: {
        candidates: cands.map((c) => ({
          id: c.id,
          proposed_name: c.proposed_name,
          proposed_role: c.proposed_role,
          proposed_country: c.proposed_country,
          general_rationale: c.general_rationale,
          topic_fit_rationale: c.topic_fit_rationale,
          topic_fit_score: c.topic_fit_score,
          composite_score: c.composite_score,
          social_links: c.social_links,
          status: c.status,
        })),
      },
    }
  } catch (e) {
    return { success: false, error: errorOf(e) }
  }
}

/**
 * Assign a discovered candidate to a locked-topic episode candidate.
 * Bridges the discovery candidate → khat_map_guest_candidates (creating
 * a global guest if needed), then sets the episode's
 * `suggested_guest_candidate_id`. When every approved candidate in the
 * season has an assigned guest, flips `wizard_stage = "complete"`.
 */
export async function assignDiscoveredGuestToEpisodeAction(input: {
  seasonId: string
  episodeCandidateId: string
  discoveryCandidateId: string
}): Promise<Result<{ ok: true; seasonComplete: boolean }>> {
  await requireAdmin()
  const user = await getAdminAuthUser()
  if (!user) return { success: false, error: "غير مصرح" }
  if (!db) return { success: false, error: "قاعدة البيانات غير متوفرة" }
  try {
    const { promoteDiscoveryCandidate } = await import("@/lib/discovery/promote")
    const promotion = await promoteDiscoveryCandidate(input.discoveryCandidateId, {
      actorId: user.id,
    })

    // promoteCandidateAction returns the global `guest_id` via the
    // bridge. Bridge already creates a khat_map_guest_candidates row
    // for the season — find it and wire it to the episode candidate.
    const [khatMapGuest] = await db
      .select({ id: khatMapGuestCandidates.id })
      .from(khatMapGuestCandidates)
      .where(
        and(
          eq(khatMapGuestCandidates.season_id, input.seasonId),
          eq(khatMapGuestCandidates.linked_guest_id, promotion.guest_id),
        ),
      )
      .limit(1)
    if (!khatMapGuest) {
      return {
        success: false,
        error: "لم نجد سجل الضيف في خريطة الموسم بعد الترقية.",
      }
    }

    await db
      .update(khatMapEpisodeCandidates)
      .set({
        suggested_guest_candidate_id: khatMapGuest.id,
        updated_at: new Date(),
      })
      .where(eq(khatMapEpisodeCandidates.id, input.episodeCandidateId))

    // Also link the canonical guest to the EIR (the production record) and
    // advance its phase. Without this, "assign to this episode" wires the
    // season candidate but leaves EIR.guest_id NULL, so the episode stays
    // in `guest_discovery` and preparation remains blocked. The candidate
    // carries its eir_id once it has walked into an EIR.
    const [epc] = await db
      .select({ eir_id: khatMapEpisodeCandidates.eir_id })
      .from(khatMapEpisodeCandidates)
      .where(eq(khatMapEpisodeCandidates.id, input.episodeCandidateId))
      .limit(1)
    if (epc?.eir_id) {
      const { assignEirGuestAction } = await import(
        "@/app/admin/khat-brain/episodes/[eirId]/actions"
      )
      await assignEirGuestAction(epc.eir_id, promotion.guest_id)
    }

    // Compute season completion: every approved episode must now have
    // a suggested guest. When that holds, advance to "complete".
    const approved = await db
      .select({
        id: khatMapEpisodeCandidates.id,
        suggested_guest_candidate_id:
          khatMapEpisodeCandidates.suggested_guest_candidate_id,
      })
      .from(khatMapEpisodeCandidates)
      .where(
        and(
          eq(khatMapEpisodeCandidates.season_id, input.seasonId),
          eq(khatMapEpisodeCandidates.status, "approved"),
        ),
      )
    const missing = approved.filter((c) => !c.suggested_guest_candidate_id).length
    const seasonComplete = approved.length > 0 && missing === 0
    if (seasonComplete) {
      await db
        .update(khatMapSeasons)
        .set({ wizard_stage: "complete", updated_at: new Date() })
        .where(eq(khatMapSeasons.id, input.seasonId))
    }

    revalidatePath(`/admin/khat-brain/seasons/${input.seasonId}`)
    return { success: true, data: { ok: true, seasonComplete } }
  } catch (e) {
    return { success: false, error: errorOf(e) }
  }
}

// ─── 2. Batch generation ─────────────────────────────────────────────────────

export async function generateBatchAction(input: {
  seasonId: string
  size?: number
}): Promise<Result<BatchResult>> {
  await requireAdmin()
  const user = await getAdminAuthUser()
  if (!user) return { success: false, error: "غير مصرح" }

  const season = await getSeasonById(input.seasonId)
  if (!season) return { success: false, error: "الموسم غير موجود" }

  const mode = (season.v2_mode as KhatMapV2Mode | null) ?? "guided"
  if (mode === "manual") {
    return {
      success: false,
      error: "الوضع اليدوي لا يولّد تلقائياً — أضف حلقة يدوياً",
    }
  }

  try {
    const res = await generateBatch({
      season_id: input.seasonId,
      admin_id: user.id,
      size: input.size ?? 4,
      // Mode → engine knobs mapping. See PR3 design doc in the brief.
      use_cross_season_negatives: mode !== "open_ai",
      invasion_policy: "optional",
      mode,
    })
    revalidatePath(`/admin/khat-brain/seasons/${input.seasonId}`)
    // Validation: the LLM produced candidates but every one was filtered out.
    // Explain WHICH filter so the operator can act, instead of an unexplained
    // empty batch. Two distinct causes (Guided hybrid surfaces the second):
    //   - editorial controls too strict (gender/geo/banned), or
    //   - everything near-duplicated the already-chosen / seeded topics.
    if (res.cards.length === 0 && res.stats.oversampled > 0) {
      const editorialDropped = res.stats.editorial_dropped > 0
      const dedupDropped = res.stats.dedup_dropped > 0
      if (editorialDropped && !dedupDropped) {
        return {
          success: false,
          error: `الفلاتر التحريرية صارمة جدًا — أُسقطت كل ${res.stats.editorial_dropped} بطاقة. خفّف الفلاتر (الجنس / الجغرافيا / المواضيع الممنوعة) ثم أعد التوليد.`,
          code: "EDITORIAL_FILTERS_TOO_STRICT",
        }
      }
      if (dedupDropped) {
        return {
          success: false,
          error: `كل الاقتراحات كانت قريبة جدًا من مواضيعك المختارة (أُسقطت ${res.stats.dedup_dropped}). نوّع البذور اليدوية أو قلّلها، ثم أعد التوليد.`,
          code: "ALL_CANDIDATES_DEDUPED",
        }
      }
      return {
        success: false,
        error: "لم يقترح المولّد مواضيع جديدة كافية — أعد التوليد أو عدّل الإعدادات.",
        code: "EMPTY_BATCH",
      }
    }
    return { success: true, data: res }
  } catch (e) {
    if (e instanceof AngleBankExhaustedError) {
      return {
        success: false,
        error: `بنك الزوايا نفد — ${e.available} زاوية متاحة، ${e.required} مطلوبة. بدّل الوضع إلى "موجّه" أو "استكشاف" لتكملة الموسم.`,
        code: "ANGLE_BANK_EXHAUSTED",
      }
    }
    return { success: false, error: errorOf(e) }
  }
}

// ─── 3. Decisions (accept / reject / skip) ───────────────────────────────────

export interface CardDecisionInput {
  seasonId: string
  topicCandidateId: string
  guestCandidateId: string | null
  batchIndex: number
  reasonCategory?: KhatMapFeedbackReasonCategory
  reasonText?: string
}

export async function acceptCardAction(
  input: CardDecisionInput,
): Promise<Result<{ decisionId: string }>> {
  return recordCardDecision("accept", "pair", input)
}

export async function rejectCardAction(
  input: CardDecisionInput,
): Promise<Result<{ decisionId: string }>> {
  return recordCardDecision("reject", "pair", input)
}

async function recordCardDecision(
  kind: "accept" | "reject",
  target: "pair" | "topic" | "guest",
  input: CardDecisionInput,
): Promise<Result<{ decisionId: string }>> {
  await requireAdmin()
  const user = await getAdminAuthUser()
  if (!user) return { success: false, error: "غير مصرح" }

  try {
    const topic = await loadTopic(input.topicCandidateId)
    if (!topic) return { success: false, error: "الحلقة غير موجودة" }

    // Production-readiness fix sprint #2.12 — auto-fill reason_text
    // when the wizard didn't capture one. This stops the decisions
    // journal from filling with NULL rows and gives the audit trail
    // enough context to reconstruct what the operator chose and why.
    const autoReasonText = (() => {
      if (input.reasonText && input.reasonText.trim().length > 0) {
        return input.reasonText
      }
      const domain = topic.topic_domain
      const score =
        typeof (topic as { composite_score?: unknown }).composite_score === "number"
          ? `score=${(topic as { composite_score: number }).composite_score.toFixed(2)} · `
          : ""
      if (kind === "accept") {
        return `auto: accept · target=${target} · ${score}domain=${domain}`
      }
      if (kind === "reject") {
        return `auto: reject · target=${target} · ${score}domain=${domain}`
      }
      return `auto: ${kind} · target=${target} · domain=${domain}`
    })()

    const { decision } = await recordDecisionAndFingerprint({
      season_id: input.seasonId,
      admin_id: user.id,
      batch_index: input.batchIndex,
      kind,
      target,
      topic_candidate_id: input.topicCandidateId,
      guest_candidate_id: input.guestCandidateId,
      topic_title: topic.working_title,
      topic_summary: topic.why_matters ?? topic.description ?? null,
      topic_domain: topic.topic_domain,
      topic_angle_code: topic.topic_angle_code,
      reason_category: input.reasonCategory ?? null,
      reason_text: autoReasonText,
    })

    // Flip the candidate's status so it drops out of the "to review" queue.
    const nextStatus =
      kind === "accept" ? "approved" : target === "guest" ? "under_review" : "rejected"
    await db!
      .update(khatMapEpisodeCandidates)
      .set({ status: nextStatus })
      .where(eq(khatMapEpisodeCandidates.id, input.topicCandidateId))

    // Khat Brain — every accepted candidate becomes an Episode Intelligence
    // Record. The bridge is idempotent (unique partial index protects
    // against double-creation if the admin double-clicks accept).
    if (kind === "accept") {
      try {
        const fresh = await getEpisodeCandidateById(input.topicCandidateId)
        if (fresh) {
          await ensureEirForCandidate({
            candidate: fresh,
            guestId: input.guestCandidateId,
            adminId: user.id,
          })
        }
      } catch (err) {
        // Don't fail the user-visible accept on a Brain wiring hiccup —
        // the decision row is the source of truth for the wizard. Log and
        // surface a non-blocking warning. Backfill can recover later.
        console.error("[khat-brain] ensureEirForCandidate failed:", err)
      }
    }

    revalidatePath(`/admin/khat-brain/seasons/${input.seasonId}`)
    return { success: true, data: { decisionId: decision.id } }
  } catch (e) {
    return { success: false, error: errorOf(e) }
  }
}

// ─── 4. Alternative sheet ────────────────────────────────────────────────────

export type AlternativeMode =
  | "keep_topic_change_guest"
  | "keep_guest_generate_new_topic"
  | "replace_both"
  | "reject_both"

export interface AlternativeInput {
  seasonId: string
  topicCandidateId: string
  guestCandidateId: string | null
  batchIndex: number
  mode: AlternativeMode
}

/**
 * The alternative sheet records a directed rejection (pair / topic / guest)
 * and — when the admin asked for an immediate replacement — surfaces a
 * matching new card.
 *
 * For `keep_guest_generate_new_topic` we re-run the guest-first engine
 * with angle_count=1 to produce a single fresh topic anchored to the
 * existing guest. The other modes record the rejection and let the next
 * `generateBatch` call surface new candidates naturally.
 */
export async function alternativeAction(
  input: AlternativeInput,
): Promise<
  Result<{
    decisionId: string
    /** One fresh BatchCard when the mode immediately generates a replacement. */
    replacement_card: BatchCard | null
  }>
> {
  await requireAdmin()
  const user = await getAdminAuthUser()
  if (!user) return { success: false, error: "غير مصرح" }

  try {
    const topic = await loadTopic(input.topicCandidateId)
    if (!topic) return { success: false, error: "الحلقة غير موجودة" }
    const guest = input.guestCandidateId
      ? await loadGuest(input.guestCandidateId)
      : null

    const { target, reasonCategory } = mapAltMode(input.mode)

    const { decision } = await recordDecisionAndFingerprint({
      season_id: input.seasonId,
      admin_id: user.id,
      batch_index: input.batchIndex,
      kind: "reject",
      target,
      topic_candidate_id: input.topicCandidateId,
      guest_candidate_id: input.guestCandidateId,
      topic_title: topic.working_title,
      topic_summary: topic.why_matters ?? topic.description ?? null,
      topic_domain: topic.topic_domain,
      topic_angle_code: topic.topic_angle_code,
      reason_category: reasonCategory,
    })

    // Status flips per-target.
    if (target === "pair" || target === "topic") {
      await db!
        .update(khatMapEpisodeCandidates)
        .set({ status: "rejected" })
        .where(eq(khatMapEpisodeCandidates.id, input.topicCandidateId))
    }

    // Immediate replacement for keep_guest_generate_new_topic.
    let replacement_card: BatchCard | null = null
    if (input.mode === "keep_guest_generate_new_topic" && guest) {
      const res = await generateGuestFirstCards({
        season_id: input.seasonId,
        admin_id: user.id,
        batch_index: input.batchIndex,
        angle_count: 1,
        guest: {
          full_name: guest.full_name,
          bio: guest.bio,
          social_accounts: guest.social_accounts,
          official_website: guest.official_website,
        },
      })
      replacement_card = res.cards[0] ?? null
    }

    revalidatePath(`/admin/khat-brain/seasons/${input.seasonId}`)
    return {
      success: true,
      data: { decisionId: decision.id, replacement_card },
    }
  } catch (e) {
    return { success: false, error: errorOf(e) }
  }
}

function mapAltMode(mode: AlternativeMode): {
  target: "pair" | "topic" | "guest"
  reasonCategory: KhatMapFeedbackReasonCategory
} {
  switch (mode) {
    case "keep_topic_change_guest":
      return { target: "guest", reasonCategory: "weak_guest" }
    case "keep_guest_generate_new_topic":
      return { target: "topic", reasonCategory: "wrong_angle" }
    case "replace_both":
      return { target: "pair", reasonCategory: "other" }
    case "reject_both":
      return { target: "pair", reasonCategory: "off_brand" }
  }
}

// ─── 5. Undo ─────────────────────────────────────────────────────────────────

/**
 * Reverse a decision within its 10-second window. Also flips the affected
 * candidate back to `proposed` so it reappears in the review queue, and
 * drops the fingerprint(s) so similarity filtering stops blocking it.
 */
export async function undoV2DecisionAction(
  decisionId: string,
): Promise<Result<{ restored_candidate_id: string | null }>> {
  await requireAdmin()
  try {
    // Load the decision before undo so we know which candidate to restore.
    const rows = await db!
      .select()
      .from(khatMapSeasonDecisions)
      .where(eq(khatMapSeasonDecisions.id, decisionId))
      .limit(1)
    const decision = rows[0]
    if (!decision) return { success: false, error: "القرار غير موجود" }

    const undone = await undoDecisionAndFingerprint(decisionId)
    if (!undone) {
      return { success: false, error: "انتهت مدة التراجع (10 ثوانٍ)" }
    }

    let restoredId: string | null = null
    if (decision.topic_candidate_id) {
      await db!
        .update(khatMapEpisodeCandidates)
        .set({ status: "proposed" })
        .where(eq(khatMapEpisodeCandidates.id, decision.topic_candidate_id))
      restoredId = decision.topic_candidate_id
    }

    revalidatePath(`/admin/khat-brain/seasons/${decision.season_id}`)
    return { success: true, data: { restored_candidate_id: restoredId } }
  } catch (e) {
    return { success: false, error: errorOf(e) }
  }
}

// ─── 6. State readers (overview + progress) ──────────────────────────────────

export interface SeasonProgress {
  accepted_count: number
  rejected_count: number
  skipped_count: number
  target: number
  is_complete: boolean
  /** Last non-undone decision — drives the undo toast. */
  last_decision_id: string | null
  last_decision_at: string | null
}

export async function getSeasonProgressAction(
  seasonId: string,
): Promise<Result<SeasonProgress>> {
  await requireAdmin()
  try {
    const season = await getSeasonById(seasonId)
    if (!season) return { success: false, error: "الموسم غير موجود" }
    const target = season.v2_episode_target ?? 10

    const decisions = await db!
      .select()
      .from(khatMapSeasonDecisions)
      .where(
        and(
          eq(khatMapSeasonDecisions.season_id, seasonId),
          isNull(khatMapSeasonDecisions.undone_at),
        ),
      )
      .orderBy(khatMapSeasonDecisions.created_at)

    let accepted = 0
    let rejected = 0
    let skipped = 0
    for (const d of decisions) {
      if (d.kind === "accept") accepted++
      else if (d.kind === "reject") rejected++
      else if (d.kind === "skip") skipped++
    }
    const last = decisions[decisions.length - 1]

    return {
      success: true,
      data: {
        accepted_count: accepted,
        rejected_count: rejected,
        skipped_count: skipped,
        target,
        is_complete: accepted >= target,
        last_decision_id: last?.id ?? null,
        last_decision_at: last?.created_at.toISOString() ?? null,
      },
    }
  } catch (e) {
    return { success: false, error: errorOf(e) }
  }
}

/** Episode cards accepted into the season — the Overview grid. */
export async function listAcceptedCardsAction(
  seasonId: string,
): Promise<
  Result<
    Array<{
      topic: KhatMapEpisodeCandidate
      guest: KhatMapGuestCandidate | null
    }>
  >
> {
  await requireAdmin()
  try {
    const rows = await db!
      .select()
      .from(khatMapEpisodeCandidates)
      .where(
        and(
          eq(khatMapEpisodeCandidates.season_id, seasonId),
          eq(khatMapEpisodeCandidates.status, "approved"),
        ),
      )
      .orderBy(khatMapEpisodeCandidates.created_at)
    const guestIds = rows
      .map((r) => r.suggested_guest_candidate_id)
      .filter((x): x is string => x !== null)
    const guests = guestIds.length
      ? await db!
          .select()
          .from(khatMapGuestCandidates)
          .where(inArray(khatMapGuestCandidates.id, guestIds))
      : []
    const guestById = new Map(guests.map((g) => [g.id, g]))
    const pairs = rows.map((r) => ({
      topic: r as unknown as KhatMapEpisodeCandidate,
      guest: (r.suggested_guest_candidate_id
        ? (guestById.get(r.suggested_guest_candidate_id) as unknown as KhatMapGuestCandidate)
        : null) ?? null,
    }))
    return { success: true, data: pairs }
  } catch (e) {
    return { success: false, error: errorOf(e) }
  }
}

/**
 * Episode candidates still awaiting a decision — the "current batch" on
 * page reload. Returns proposed-status rows ordered by creation.
 */
/**
 * CR-7 — near-duplicate detection on the pending candidate list uses the
 * shared token-Jaccard helpers (`@/lib/khat-map/v2/title-similarity`), the
 * same implementation the batch engine uses to dedup AI candidates against
 * already-chosen seeds. Query-layer dedup (not insert-time) preserves the
 * audit trail of every AI suggestion.
 */
export async function listPendingCardsAction(
  seasonId: string,
): Promise<
  Result<
    Array<{
      topic: KhatMapEpisodeCandidate
      guest: KhatMapGuestCandidate | null
    }>
  >
> {
  await requireAdmin()
  try {
    const rows = await db!
      .select()
      .from(khatMapEpisodeCandidates)
      .where(
        and(
          eq(khatMapEpisodeCandidates.season_id, seasonId),
          eq(khatMapEpisodeCandidates.status, "proposed"),
        ),
      )
      .orderBy(khatMapEpisodeCandidates.created_at)
    const guestIds = rows
      .map((r) => r.suggested_guest_candidate_id)
      .filter((x): x is string => x !== null)
    const guests = guestIds.length
      ? await db!
          .select()
          .from(khatMapGuestCandidates)
          .where(inArray(khatMapGuestCandidates.id, guestIds))
      : []
    const guestById = new Map(guests.map((g) => [g.id, g]))
    const pairs = rows.map((r) => ({
      topic: r as unknown as KhatMapEpisodeCandidate,
      guest: (r.suggested_guest_candidate_id
        ? (guestById.get(r.suggested_guest_candidate_id) as unknown as KhatMapGuestCandidate)
        : null) ?? null,
    }))

    // CR-7 — collapse near-duplicate titles. Keep the FIRST occurrence
    // of each cluster (which is the highest-scored due to the upstream
    // ordering by created_at + composite_score on insert). Subsequent
    // hits in the same cluster are hidden but remain in DB.
    const kept: typeof pairs = []
    const keptTokens: Array<Set<string>> = []
    for (const p of pairs) {
      const title = p.topic.working_title ?? ""
      const tokens = normalizeTitleTokens(title)
      let isDup = false
      for (const prior of keptTokens) {
        if (
          jaccardSimilarity(tokens, prior) >= TITLE_DEDUP_JACCARD_THRESHOLD
        ) {
          isDup = true
          break
        }
      }
      if (!isDup) {
        kept.push(p)
        keptTokens.push(tokens)
      }
    }

    return { success: true, data: kept }
  } catch (e) {
    return { success: false, error: errorOf(e) }
  }
}

// ─── 7. Guest injection ──────────────────────────────────────────────────────

export async function injectGuestAction(input: {
  seasonId: string
  guest: {
    full_name: string
    bio?: string | null
    social_accounts?: import("@/types/khat-map").KhatMapGuestSocialAccounts
    official_website?: string | null
  }
  batchIndex?: number
}): Promise<Result<{ cards: BatchCard[] }>> {
  await requireAdmin()
  const user = await getAdminAuthUser()
  if (!user) return { success: false, error: "غير مصرح" }
  if (!input.guest.full_name.trim()) {
    return { success: false, error: "الاسم مطلوب" }
  }
  // Phase A/B redesign — guest-first injection produces topic+guest pairs.
  // It only makes sense once topics are locked. Block it during Phase A
  // so the operator finishes topic selection first.
  const season = await getSeasonById(input.seasonId)
  if (!season) return { success: false, error: "الموسم غير موجود" }
  if (season.wizard_stage === "topics" || season.wizard_stage === "setup") {
    return {
      success: false,
      error: "اقفل المواضيع أولًا قبل ربط ضيف بحلقة. الضيوف في المرحلة الثانية.",
    }
  }
  try {
    const res = await generateGuestFirstCards({
      season_id: input.seasonId,
      admin_id: user.id,
      batch_index: input.batchIndex ?? 0,
      angle_count: 3,
      guest: {
        full_name: input.guest.full_name.trim(),
        bio: input.guest.bio ?? null,
        social_accounts: input.guest.social_accounts ?? {},
        official_website: input.guest.official_website ?? null,
      },
    })
    revalidatePath(`/admin/khat-brain/seasons/${input.seasonId}`)
    return { success: true, data: { cards: res.cards } }
  } catch (e) {
    return { success: false, error: errorOf(e) }
  }
}

// ─── 8. Intelligent completion ───────────────────────────────────────────────

export interface CompletionPreview {
  accepted_count: number
  target: number
  remaining_slots: number
  missing_roles: KhatMapMustIncludeRole[]
  /** True when a banner / CTA should be shown. */
  should_offer_autocomplete: boolean
}

export async function getCompletionPreviewAction(
  seasonId: string,
): Promise<Result<CompletionPreview>> {
  await requireAdmin()
  try {
    const season = await getSeasonById(seasonId)
    if (!season) return { success: false, error: "الموسم غير موجود" }
    const target = season.v2_episode_target ?? 10

    const rows = await db!
      .select({
        episode_type: khatMapEpisodeCandidates.episode_type,
        topic_domain: khatMapEpisodeCandidates.topic_domain,
        risk_level: khatMapEpisodeCandidates.risk_level,
      })
      .from(khatMapEpisodeCandidates)
      .where(
        and(
          eq(khatMapEpisodeCandidates.season_id, seasonId),
          eq(khatMapEpisodeCandidates.status, "approved"),
        ),
      )
    const accepted_count = rows.length
    const remaining_slots = Math.max(0, target - accepted_count)
    const missing_roles = detectMissingRoles(rows)
    // Banner surfaces when the admin is in the endgame AND has genuine
    // gaps — not when they're already at target (overview takes over)
    // and not when the missing set is empty.
    const should_offer_autocomplete =
      season.v2_mode !== "manual" &&
      remaining_slots > 0 &&
      remaining_slots <= 2 &&
      missing_roles.length > 0
    return {
      success: true,
      data: {
        accepted_count,
        target,
        remaining_slots,
        missing_roles,
        should_offer_autocomplete,
      },
    }
  } catch (e) {
    return { success: false, error: errorOf(e) }
  }
}

export async function autoCompleteSeasonAction(
  seasonId: string,
): Promise<Result<{ cards: BatchCard[]; filled_roles: KhatMapMustIncludeRole[] }>> {
  await requireAdmin()
  const user = await getAdminAuthUser()
  if (!user) return { success: false, error: "غير مصرح" }
  try {
    const preview = await getCompletionPreviewAction(seasonId)
    if (!preview.success) return preview
    const { remaining_slots, missing_roles } = preview.data
    if (remaining_slots === 0) {
      return { success: false, error: "الموسم مكتمل" }
    }
    const roles = prioritizeMissingRoles(missing_roles, remaining_slots)
    if (roles.length === 0) {
      return { success: false, error: "لا توجد أدوار ناقصة" }
    }
    const season = await getSeasonById(seasonId)
    const mode = (season?.v2_mode as typeof season extends null ? never : KhatMapV2Mode | null) ?? "guided"
    const res = await generateBatch({
      season_id: seasonId,
      admin_id: user.id,
      size: roles.length,
      use_cross_season_negatives: mode !== "open_ai",
      invasion_policy: "optional",
      mode: (mode as KhatMapV2Mode) ?? "guided",
      required_roles: roles,
    })
    revalidatePath(`/admin/khat-brain/seasons/${seasonId}`)
    return {
      success: true,
      data: { cards: res.cards, filled_roles: roles },
    }
  } catch (e) {
    if (e instanceof AngleBankExhaustedError) {
      return {
        success: false,
        error: "بنك الزوايا نفد — بدّل الوضع لإكمال الموسم.",
        code: "ANGLE_BANK_EXHAUSTED",
      }
    }
    return { success: false, error: errorOf(e) }
  }
}

// ─── 9. Single-slot regenerate (from Overview) ──────────────────────────────

export async function regenerateSlotAction(input: {
  seasonId: string
  topicCandidateId: string
}): Promise<Result<{ card: BatchCard | null }>> {
  await requireAdmin()
  const user = await getAdminAuthUser()
  if (!user) return { success: false, error: "غير مصرح" }
  try {
    const topic = await loadTopic(input.topicCandidateId)
    if (!topic) return { success: false, error: "الحلقة غير موجودة" }

    // 1. Journal a "regenerate" as a reject so the similarity filter
    //    avoids re-proposing the same idea. Not undoable — this is a
    //    deliberate admin action from the overview.
    await recordDecisionAndFingerprint({
      season_id: input.seasonId,
      admin_id: user.id,
      batch_index: 0,
      kind: "reject",
      target: "pair",
      topic_candidate_id: input.topicCandidateId,
      topic_title: topic.working_title,
      topic_summary: topic.why_matters ?? topic.description ?? null,
      topic_domain: topic.topic_domain,
      topic_angle_code: topic.topic_angle_code,
      reason_category: "other",
      reason_text: "regenerate_requested",
    })
    // Move the retired candidate out of 'approved'.
    await updateEpisodeCandidateStatus(input.topicCandidateId, "rejected")

    // 2. Generate one fresh candidate. It lands in the pending stack
    //    so the admin accepts/rejects it like any other card.
    const season = await getSeasonById(input.seasonId)
    const mode = (season?.v2_mode as KhatMapV2Mode | null) ?? "guided"
    const res = await generateBatch({
      season_id: input.seasonId,
      admin_id: user.id,
      size: 1,
      use_cross_season_negatives: mode !== "open_ai",
      invasion_policy: "optional",
      mode,
    })
    revalidatePath(`/admin/khat-brain/seasons/${input.seasonId}`)
    return { success: true, data: { card: res.cards[0] ?? null } }
  } catch (e) {
    if (e instanceof AngleBankExhaustedError) {
      return {
        success: false,
        error: "بنك الزوايا نفد — لا يمكن توليد بديل في الوضع الصارم.",
        code: "ANGLE_BANK_EXHAUSTED",
      }
    }
    return { success: false, error: errorOf(e) }
  }
}

// ─── 10. Minimal episode edit (from Overview) ───────────────────────────────

export async function editEpisodeAction(input: {
  seasonId: string
  topicCandidateId: string
  patch: {
    working_title?: string
    hook?: string | null
    why_matters?: string | null
    why_now?: string | null
    goal?: string | null
    description?: string | null
  }
}): Promise<Result<{ ok: true }>> {
  await requireAdmin()
  try {
    const clean = {
      ...(input.patch.working_title !== undefined
        ? { working_title: input.patch.working_title.trim() }
        : {}),
      ...(input.patch.hook !== undefined
        ? { hook: input.patch.hook?.trim() || null }
        : {}),
      ...(input.patch.why_matters !== undefined
        ? { why_matters: input.patch.why_matters?.trim() || null }
        : {}),
      ...(input.patch.why_now !== undefined
        ? { why_now: input.patch.why_now?.trim() || null }
        : {}),
      ...(input.patch.goal !== undefined
        ? { goal: input.patch.goal?.trim() || null }
        : {}),
      ...(input.patch.description !== undefined
        ? { description: input.patch.description?.trim() || null }
        : {}),
    }
    if (Object.keys(clean).length === 0) {
      return { success: false, error: "لا توجد حقول للحفظ" }
    }

    // Phase A/B redesign — if the season has already locked topics and
    // moved into (or past) Phase B, an edit to the topic content
    // invalidates any guest discovery that ran against the old title.
    // Stamp `discovery_stale_at` so the candidate card surfaces the
    // "re-run discovery" CTA. We only stale when editorial-content
    // fields changed (working_title / hook / why_matters / why_now /
    // goal / description) — all of `clean`'s keys qualify, so any patch
    // staleens the candidate.
    const season = await getSeasonById(input.seasonId)
    const phaseBLive =
      season &&
      (season.wizard_stage === "topics_locked" ||
        season.wizard_stage === "guests" ||
        season.wizard_stage === "complete")
    const updates: Record<string, unknown> = {
      ...clean,
      updated_at: new Date(),
    }
    if (phaseBLive) {
      updates.discovery_stale_at = new Date()
    }
    await db!
      .update(khatMapEpisodeCandidates)
      .set(updates)
      .where(eq(khatMapEpisodeCandidates.id, input.topicCandidateId))
    revalidatePath(`/admin/khat-brain/seasons/${input.seasonId}`)
    return { success: true, data: { ok: true } }
  } catch (e) {
    return { success: false, error: errorOf(e) }
  }
}

// ─── 11. Switch v2 mode (for strict-exhaustion fallback) ────────────────────

export async function switchV2ModeAction(input: {
  seasonId: string
  mode: KhatMapV2Mode
}): Promise<Result<{ ok: true }>> {
  await requireAdmin()
  try {
    await db!
      .update(khatMapSeasons)
      .set({ v2_mode: input.mode })
      .where(eq(khatMapSeasons.id, input.seasonId))
    revalidatePath(`/admin/khat-brain/seasons/${input.seasonId}`)
    return { success: true, data: { ok: true } }
  } catch (e) {
    return { success: false, error: errorOf(e) }
  }
}

// ─── 12. Convert approved card → preparation ────────────────────────────────
//
// Reuses the conversion library at `lib/khat-map/conversion/`. Idempotency,
// learning side-effects, and field carry-over are owned there.

import {
  convertEpisodeToPreparation,
  type ConversionResult,
} from "@/lib/khat-map/conversion"
import { episodes } from "@/lib/db/schema/episodes"
import { episodePreparations } from "@/lib/db/schema/preparation"

export type ConvertCardResult =
  | {
      success: true
      data: {
        preparation_id: string
        href: string
        was_existing: boolean
        converted_at: string
      }
    }
  | {
      success: false
      error: string
      code?:
        | "MISSING_GUEST"
        | "NOT_FOUND"
        | "DB_ERROR"
        | "UNAUTHORIZED"
        | "CANDIDATE_NOT_APPROVED"
    }

/**
 * Convert one approved Khat Map episode candidate into a preparation.
 *
 * Idempotent — re-running on an already-converted candidate returns the
 * existing link with `was_existing: true`. The UI relies on this and
 * surfaces "View preparation →" without showing an error.
 *
 * Carry-over (in the conversion library):
 *   • title, hook, why_matters, why_now, goal, description → composed
 *     into preparation.short_description
 *   • main_axes, suggested_questions, production_notes → preserved on
 *     preparation.inputs_meta.khat_map_*
 *   • risk_level → preparation.boldness_level
 *   • episode_type → preparation.tone_type + content_focus
 *   • guest identity → full PreparationGuestIdentity object
 *   • inputs_meta.khat_map_source carries the lineage (season_id,
 *     candidate_id, guest_id) for later analytics joins
 */
export async function convertV2CardToPreparationAction(input: {
  seasonId: string
  topicCandidateId: string
}): Promise<ConvertCardResult> {
  await requireAdmin()
  const user = await getAdminAuthUser()
  if (!user) {
    return { success: false, error: "غير مصرح", code: "UNAUTHORIZED" }
  }
  if (!input.topicCandidateId) {
    return { success: false, error: "بيانات غير صالحة", code: "NOT_FOUND" }
  }

  // Only `approved` candidates can be converted from the wizard overview.
  const candidate = await loadTopic(input.topicCandidateId)
  if (!candidate) {
    return { success: false, error: "الحلقة غير موجودة", code: "NOT_FOUND" }
  }
  if (
    candidate.status !== "approved" &&
    candidate.status !== "converted_to_preparation"
  ) {
    return {
      success: false,
      error: "الحلقة لم تُعتمد بعد — اقبلها أولاً قبل التحويل",
      code: "CANDIDATE_NOT_APPROVED",
    }
  }

  const result: ConversionResult = await convertEpisodeToPreparation({
    episode_candidate_id: input.topicCandidateId,
    admin_id: user.id,
  })
  if (!result.ok) {
    if (result.reason === "missing_linked_guest") {
      return { success: false, error: result.message, code: "MISSING_GUEST" }
    }
    if (result.reason === "not_found") {
      return { success: false, error: result.message, code: "NOT_FOUND" }
    }
    return { success: false, error: result.message, code: "DB_ERROR" }
  }

  revalidatePath(`/admin/khat-brain/seasons/${input.seasonId}`)
  revalidatePath("/admin/preparation")
  revalidatePath(`/admin/preparation/${result.link.target_id}`)

  return {
    success: true,
    data: {
      preparation_id: result.link.target_id,
      href: result.link.href,
      was_existing: result.was_existing,
      converted_at: result.link.converted_at,
    },
  }
}

// ─── 13. Production-status loop view ────────────────────────────────────────
//
// Joins khat_map_episode_candidates → episode_preparations → episodes so
// the Overview can render a "approved → preparation → published" chain
// per accepted candidate. No new schema; this exists today via existing
// FKs.

export interface ProductionStatusRow {
  candidate_id: string
  candidate_title: string
  candidate_status: KhatMapEpisodeCandidate["status"]
  guest_name: string | null
  preparation: {
    id: string
    href: string
    created_at: string
  } | null
  published_episode: {
    id: string
    title: string
    slug: string
    youtube_url: string | null
    release_date: string | null
    view_count: number | null
    status: string | null
    href: string
  } | null
}

export async function listSeasonProductionStatusAction(
  seasonId: string,
): Promise<Result<{ rows: ProductionStatusRow[] }>> {
  await requireAdmin()
  try {
    // 1. All approved + converted candidates in the season.
    const cands = await db!
      .select({
        id: khatMapEpisodeCandidates.id,
        working_title: khatMapEpisodeCandidates.working_title,
        status: khatMapEpisodeCandidates.status,
        suggested_guest_candidate_id:
          khatMapEpisodeCandidates.suggested_guest_candidate_id,
        converted_preparation_id:
          khatMapEpisodeCandidates.converted_preparation_id,
        converted_episode_id: khatMapEpisodeCandidates.converted_episode_id,
      })
      .from(khatMapEpisodeCandidates)
      .where(
        and(
          eq(khatMapEpisodeCandidates.season_id, seasonId),
          inArray(khatMapEpisodeCandidates.status, [
            "approved",
            "converted_to_preparation",
            "converted_to_episode",
          ]),
        ),
      )
      .orderBy(khatMapEpisodeCandidates.created_at)

    // 2. Pull in linked preparations + the episodes those prepartions point at.
    const prepIds = cands
      .map((c) => c.converted_preparation_id)
      .filter((x): x is string => !!x)
    const prepRows = prepIds.length
      ? await db!
          .select({
            id: episodePreparations.id,
            created_at: episodePreparations.created_at,
            linked_episode_id: episodePreparations.linked_episode_id,
          })
          .from(episodePreparations)
          .where(inArray(episodePreparations.id, prepIds))
      : []
    const prepById = new Map(prepRows.map((r) => [r.id, r]))

    // 3. Episodes — both via preparation.linked_episode_id AND
    //    candidate.converted_episode_id (covers manual-link edge cases).
    const directEpisodeIds = cands
      .map((c) => c.converted_episode_id)
      .filter((x): x is string => !!x)
    const linkedEpisodeIds = prepRows
      .map((r) => r.linked_episode_id)
      .filter((x): x is string => !!x)
    const episodeIds = Array.from(
      new Set([...directEpisodeIds, ...linkedEpisodeIds]),
    )
    const episodeRows = episodeIds.length
      ? await db!
          .select({
            id: episodes.id,
            title: episodes.title,
            slug: episodes.slug,
            youtube_url: episodes.youtube_url,
            release_date: episodes.release_date,
            view_count: episodes.view_count,
            status: episodes.status,
          })
          .from(episodes)
          .where(inArray(episodes.id, episodeIds))
      : []
    const episodeById = new Map(episodeRows.map((r) => [r.id, r]))

    // 4. Guests for display.
    const guestIds = cands
      .map((c) => c.suggested_guest_candidate_id)
      .filter((x): x is string => !!x)
    const guestRows = guestIds.length
      ? await db!
          .select({
            id: khatMapGuestCandidates.id,
            full_name: khatMapGuestCandidates.full_name,
          })
          .from(khatMapGuestCandidates)
          .where(inArray(khatMapGuestCandidates.id, guestIds))
      : []
    const guestById = new Map(guestRows.map((r) => [r.id, r]))

    const out: ProductionStatusRow[] = cands.map((c) => {
      const prep = c.converted_preparation_id
        ? prepById.get(c.converted_preparation_id) ?? null
        : null
      const episodeId =
        c.converted_episode_id ?? prep?.linked_episode_id ?? null
      const ep = episodeId ? episodeById.get(episodeId) ?? null : null
      const guest = c.suggested_guest_candidate_id
        ? guestById.get(c.suggested_guest_candidate_id) ?? null
        : null
      return {
        candidate_id: c.id,
        candidate_title: c.working_title,
        candidate_status: c.status,
        guest_name: guest?.full_name ?? null,
        preparation: prep
          ? {
              id: prep.id,
              href: `/admin/preparation/${prep.id}`,
              created_at:
                prep.created_at instanceof Date
                  ? prep.created_at.toISOString()
                  : String(prep.created_at),
            }
          : null,
        published_episode: ep
          ? {
              id: ep.id,
              title: ep.title,
              slug: ep.slug,
              youtube_url: ep.youtube_url ?? null,
              release_date: ep.release_date ? String(ep.release_date) : null,
              view_count: ep.view_count ?? null,
              status: ep.status ?? null,
              // The episode detail route resolves by UUID id, not slug —
              // using the slug here 404s.
              href: `/admin/episodes/${ep.id}`,
            }
          : null,
      }
    })

    return { success: true, data: { rows: out } }
  } catch (e) {
    return { success: false, error: errorOf(e) }
  }
}

// ─── 14. Performance sync (closes the editorial-intelligence loop) ──────────
//
// Walks every converted candidate in the season, resolves the chain to
// the published episode, and snapshots performance signals into
// `khat_map_episode_performance`. Idempotent — re-running updates rather
// than duplicates. Manually triggered today; could move to a worker once
// we have YouTube-API ingestion.

import {
  syncSeasonPerformance,
  listSeasonPerformance,
} from "@/lib/khat-map/performance"
import type { KhatMapEpisodePerformance } from "@/types/khat-map"

export async function syncSeasonPerformanceAction(
  seasonId: string,
): Promise<
  Result<{ walked: number; upserted: number; not_yet_published: number }>
> {
  await requireAdmin()
  if (!seasonId) return { success: false, error: "بيانات غير صالحة" }
  try {
    const res = await syncSeasonPerformance(seasonId)
    revalidatePath(`/admin/khat-brain/seasons/${seasonId}`)
    return { success: true, data: res }
  } catch (e) {
    return { success: false, error: errorOf(e) }
  }
}

export async function listSeasonPerformanceAction(
  seasonId: string,
): Promise<Result<{ rows: KhatMapEpisodePerformance[] }>> {
  await requireAdmin()
  try {
    const rows = await listSeasonPerformance(seasonId)
    return { success: true, data: { rows } }
  } catch (e) {
    return { success: false, error: errorOf(e) }
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function loadTopic(id: string) {
  const rows = await db!
    .select()
    .from(khatMapEpisodeCandidates)
    .where(eq(khatMapEpisodeCandidates.id, id))
    .limit(1)
  return rows[0] ?? null
}

async function loadGuest(id: string) {
  const rows = await db!
    .select()
    .from(khatMapGuestCandidates)
    .where(eq(khatMapGuestCandidates.id, id))
    .limit(1)
  return rows[0] ?? null
}

async function nextSeasonNumber(): Promise<number> {
  const rows = await db!
    .select({ season_number: khatMapSeasons.season_number })
    .from(khatMapSeasons)
  return rows.reduce((m, r) => Math.max(m, r.season_number ?? 0), 0) + 1
}

function modeLabel(m: KhatMapV2Mode): string {
  switch (m) {
    case "guided":
      return "موجّه"
    case "strict":
      return "صارم"
    case "open_ai":
      return "استكشاف"
    case "manual":
      return "يدوي"
  }
}

function errorOf(e: unknown): string {
  if (e instanceof Error) return e.message
  return "حدث خطأ غير متوقع"
}
