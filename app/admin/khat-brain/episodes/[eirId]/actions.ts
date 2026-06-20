"use server"

/**
 * UX-4 — Episode Workspace server actions.
 *
 * Thin wrappers around existing primitives. The heavy lifting lives in:
 *   - lib/collaboration/rooms.ts          (createRoom + EIR walk)
 *   - lib/studio/push-to-episode.ts       (push_episode_data RPC + sync)
 *
 * Workspace pages call these from form actions / button onClick. Every
 * action revalidates the workspace path so the next render reflects the
 * new state.
 */

import { revalidatePath } from "next/cache"
import { eq, desc } from "drizzle-orm"
import { db } from "@/lib/db"
import { collaborationRooms } from "@/lib/db/schema/collaboration"
import { episodePreparations } from "@/lib/db/schema/preparation"
import { studioSessions } from "@/lib/db/schema/studio"
import { guests } from "@/lib/db/schema/guests"
import { requireAdmin, getAdminAuthUser } from "@/lib/api-utils"
import { createRoom } from "@/lib/collaboration/rooms"
import {
  runStudioPushToEpisode,
  type StudioPushFields,
  type StudioPushResult,
} from "@/lib/studio/push-to-episode"
import {
  getEpisodeIntelligenceRecord,
  setEpisodeIntelligenceGuest,
} from "@/lib/eir"
import { walkEirToPhase } from "@/lib/khat-brain"
import { bridgeDiscoveryToKhatMap } from "@/lib/discovery"
import { getSeasonById } from "@/lib/khat-map/core/queries"
import type { KhatMapEditorialControls } from "@/types/khat-map"

export interface CreateRoomActionResult {
  ok: boolean
  room_id?: string
  reason?:
    | "no_admin"
    | "no_preparation"
    | "create_failed"
  message: string
  /** True when a room already existed for this EIR + we returned it as-is. */
  existing?: boolean
}

export async function createRoomForEpisodeAction(
  eirId: string,
): Promise<CreateRoomActionResult> {
  await requireAdmin()
  const user = await getAdminAuthUser()
  if (!user) {
    return { ok: false, reason: "no_admin", message: "غير مخوّل" }
  }

  // 1. If a room already exists for this EIR, just return it.
  const [existing] = await db!
    .select({ id: collaborationRooms.id })
    .from(collaborationRooms)
    .where(eq(collaborationRooms.eir_id, eirId))
    .orderBy(desc(collaborationRooms.updated_at))
    .limit(1)
  if (existing) {
    revalidatePath(`/admin/khat-brain/episodes/${eirId}`)
    return {
      ok: true,
      room_id: existing.id,
      existing: true,
      message: "غرفة التسجيل موجودة مسبقاً.",
    }
  }

  // 2. Need a preparation to anchor the room. Resolve the latest one
  //    linked to this EIR (UX-3a wired prep.eir_id during conversion).
  const [prep] = await db!
    .select({
      id: episodePreparations.id,
      title: episodePreparations.title,
    })
    .from(episodePreparations)
    .where(eq(episodePreparations.eir_id, eirId))
    .orderBy(desc(episodePreparations.updated_at))
    .limit(1)
  if (!prep) {
    return {
      ok: false,
      reason: "no_preparation",
      message:
        "لا يوجد سجلّ إعداد مرتبط بهذه الحلقة. أنشئ الإعداد أولاً عبر تحويل المرشّح من مساحة الموسم.",
    }
  }

  // 3. Create the room. createRoom internally:
  //    - inherits the preparation's eir_id
  //    - calls walkForwardIfBehind(eirId, "ready_to_record") so the EIR
  //      moves forward via the shared sync path.
  try {
    const room = await createRoom(
      { preparation_id: prep.id, name: prep.title },
      user.id,
    )
    revalidatePath(`/admin/khat-brain/episodes/${eirId}`)
    return {
      ok: true,
      room_id: room.id,
      message: "تم إنشاء غرفة التسجيل.",
    }
  } catch (err) {
    return {
      ok: false,
      reason: "create_failed",
      message:
        err instanceof Error ? err.message : "تعذّر إنشاء غرفة التسجيل.",
    }
  }
}

// ─── Push to episode ──────────────────────────────────────────────────

export interface PushActionResult extends StudioPushResult {
  ok: boolean
  reason?:
    | "no_admin"
    | "no_studio_session"
    | "no_package"
    | "push_failed"
  message: string
}

/**
 * Pushes the studio session's website package to the linked episode by
 * calling the shared `runStudioPushToEpisode` helper that the legacy
 * /api/admin/studio/[id]/push route also uses. Single source of truth.
 */
export async function pushPackageToEpisodeAction(input: {
  eirId: string
  fields?: StudioPushFields
}): Promise<PushActionResult> {
  await requireAdmin()
  const user = await getAdminAuthUser()
  if (!user) {
    return {
      ok: false,
      reason: "no_admin",
      message: "غير مخوّل",
      pushedFields: [],
      episodeId: null,
      guestLink: null,
    }
  }

  const [session] = await db!
    .select({ id: studioSessions.id })
    .from(studioSessions)
    .where(eq(studioSessions.eir_id, input.eirId))
    .orderBy(desc(studioSessions.updated_at))
    .limit(1)
  if (!session) {
    return {
      ok: false,
      reason: "no_studio_session",
      message: "لا توجد جلسة استديو لهذه الحلقة.",
      pushedFields: [],
      episodeId: null,
      guestLink: null,
    }
  }

  // Default: push every supported field. The caller can narrow this via
  // input.fields when wired into a UI checklist.
  const fields: StudioPushFields = input.fields ?? {
    title: true,
    description: true,
    hero_summary: true,
    full_summary: true,
    takeaways: true,
    quotes: true,
    resources: true,
    timestamps: true,
  }

  try {
    const result = await runStudioPushToEpisode({
      sessionId: session.id,
      fields,
    })
    revalidatePath(`/admin/khat-brain/episodes/${input.eirId}`)
    return {
      ok: true,
      ...result,
      message: `تم الدفع — ${result.pushedFields.length} حقل.`,
    }
  } catch (err) {
    const reason = err instanceof Error && err.message.includes("package")
      ? ("no_package" as const)
      : ("push_failed" as const)
    return {
      ok: false,
      reason,
      message:
        err instanceof Error ? err.message : "تعذّر دفع الحزمة.",
      pushedFields: [],
      episodeId: null,
      guestLink: null,
    }
  }
}

// ─── Assign guest to EIR ──────────────────────────────────────────────

export interface AssignGuestActionResult {
  ok: boolean
  reason?:
    | "no_admin"
    | "eir_not_found"
    | "guest_not_found"
    | "assign_failed"
  message: string
  guestId?: string | null
  bridge?: {
    khat_guest_candidate_id: string | null
    khat_guest_candidate_created: boolean
    attached_to_episode: boolean
  }
}

/**
 * Set the linked guest on an EIR. Pass `guestId: null` to unlink.
 * When linking and the EIR is still in `idea` or `guest_discovery`,
 * walks it forward to `guest_assigned` so preparation becomes
 * eligible to start.
 */
export async function assignEirGuestAction(
  eirId: string,
  guestId: string | null,
): Promise<AssignGuestActionResult> {
  await requireAdmin()
  const user = await getAdminAuthUser()
  if (!user) {
    return { ok: false, reason: "no_admin", message: "غير مخوّل." }
  }

  const eir = await getEpisodeIntelligenceRecord(eirId)
  if (!eir) {
    return {
      ok: false,
      reason: "eir_not_found",
      message: "لم يتم العثور على سجل الحلقة.",
    }
  }

  if (guestId) {
    const [g] = await db!
      .select({ id: guests.id })
      .from(guests)
      .where(eq(guests.id, guestId))
      .limit(1)
    if (!g) {
      return {
        ok: false,
        reason: "guest_not_found",
        message: "الضيف المختار غير موجود.",
      }
    }
  }

  try {
    await setEpisodeIntelligenceGuest({ eir_id: eirId, guest_id: guestId })
    // If linking and still pre-guest_assigned, walk forward so the
    // preparation tab becomes available.
    if (guestId && (eir.phase === "idea" || eir.phase === "guest_discovery")) {
      await walkEirToPhase({
        eirId,
        toPhase: "guest_assigned",
        actorId: user.id,
        reason: "manual_guest_assignment",
      })
    }
    // Bridge into Khat Map so the season-level convert-to-preparation
    // button unblocks immediately. Idempotent — reuses an existing
    // khat_map_guest_candidate for (season, guest) when present.
    let bridgeOut:
      | {
          khat_guest_candidate_id: string | null
          khat_guest_candidate_created: boolean
          attached_to_episode: boolean
        }
      | undefined
    if (guestId) {
      const b = await bridgeDiscoveryToKhatMap({
        globalGuestId: guestId,
        eirId,
        seasonId: eir.season_id,
      })
      bridgeOut = {
        khat_guest_candidate_id: b.khat_guest_candidate_id,
        khat_guest_candidate_created: b.khat_guest_candidate_created,
        attached_to_episode: b.attached_to_episode,
      }
    }
    revalidatePath(`/admin/khat-brain/episodes/${eirId}`)
    if (eir.season_id) {
      revalidatePath(`/admin/khat-brain/seasons/${eir.season_id}`)
    }
    return {
      ok: true,
      guestId,
      message: guestId ? "تم تعيين الضيف." : "تم إلغاء ربط الضيف.",
      bridge: bridgeOut,
    }
  } catch (err) {
    return {
      ok: false,
      reason: "assign_failed",
      message: err instanceof Error ? err.message : "تعذّر تعيين الضيف.",
    }
  }
}

export interface StartEirDiscoveryResult {
  success: boolean
  runId?: string
  error?: string
}

/**
 * Launch guest discovery for a SPECIFIC episode (EIR) — without re-asking the
 * operator for a topic/title or filters.
 *
 * The episode already has a `working_title`, and if it belongs to a season it
 * inherits that season's gender/nationality guest filters. So the old
 * GuestEmpty CTA (a bare link to the generic /admin/discovery-v2 form, which
 * re-prompts for "موضوع الحلقة / المجال") was redundant. This resolves
 * everything server-side from the EIR id:
 *
 *   1. If the EIR traces back to a Khat Map episode candidate
 *      (editorial_intent.source === "khat_map_candidate"), reuse the proven
 *      season Phase-B action — it derives the topic, inherits the season's
 *      filters, and links the run to that candidate (so results also surface
 *      in Phase B). bypassStageGate, since an existing EIR is always a valid
 *      discovery target regardless of the season's wizard stage.
 *   2. Otherwise (standalone / orphan EIR), run a title-seeded discovery
 *      directly via startV2DiscoveryAction, inheriting season filters when a
 *      season is present. No form, so the title is never re-requested.
 *
 * The generic /admin/discovery-v2 form is left untouched as the ad-hoc surface.
 */
export async function startGuestDiscoveryForEirAction(
  eirId: string,
): Promise<StartEirDiscoveryResult> {
  await requireAdmin()
  const eir = await getEpisodeIntelligenceRecord(eirId)
  if (!eir) return { success: false, error: "الحلقة غير موجودة" }

  const intent = eir.editorial_intent ?? {}
  const sourceCandidateId =
    intent.source === "khat_map_candidate" && intent.source_id
      ? intent.source_id
      : null

  // Preferred path — reuse the season Phase-B per-episode discovery.
  if (eir.season_id && sourceCandidateId) {
    const { startGuestDiscoveryForEpisodeAction } = await import(
      "@/app/admin/khat-brain/seasons/actions"
    )
    const res = await startGuestDiscoveryForEpisodeAction({
      seasonId: eir.season_id,
      episodeCandidateId: sourceCandidateId,
      bypassStageGate: true,
    })
    if (res.success) return { success: true, runId: res.data.runId }
    // Fall through to the title-seeded path on any failure (e.g. the season or
    // candidate row is missing) so the operator is never dead-ended.
  }

  // Fallback — build the topic from the episode itself and inherit season
  // filters when a season is present.
  const title = eir.final_title || eir.working_title
  const topicParts: string[] = []
  if (title) topicParts.push(title)
  if (eir.topic_domain) topicParts.push(eir.topic_domain)
  if (intent.hook) topicParts.push(intent.hook)
  if (intent.why_matters) topicParts.push(intent.why_matters)
  const topic = (topicParts.join(" — ") || title || "ضيف الحلقة").slice(0, 600)

  let gender: "male" | "female" | null = null
  let nationality: "kuwaiti" | "non_kuwaiti" | null = null
  if (eir.season_id) {
    const season = await getSeasonById(eir.season_id)
    const gf = (
      season?.editorial_controls as KhatMapEditorialControls | undefined
    )?.guest_filters
    gender = gf?.gender === "male" || gf?.gender === "female" ? gf.gender : null
    nationality =
      gf?.nationality === "kuwaiti" || gf?.nationality === "non_kuwaiti"
        ? gf.nationality
        : null
  }

  const { startV2DiscoveryAction } = await import(
    "@/app/admin/discovery-v2/actions"
  )
  const v2 = await startV2DiscoveryAction({
    topic,
    gender,
    nationality,
    taste: "balanced",
    seasonId: eir.season_id ?? null,
  })
  if (!v2.success || !v2.runId) {
    return { success: false, error: v2.error ?? "تعذّر بدء البحث" }
  }
  return { success: true, runId: v2.runId }
}
