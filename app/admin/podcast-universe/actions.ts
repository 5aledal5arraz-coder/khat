"use server"

import { revalidatePath } from "next/cache"

import { requireActionRole } from "@/lib/api-utils"
import { db } from "@/lib/db"
import { eq, sql } from "drizzle-orm"
import {
  podcastChannels,
  PODCAST_REGISTRY_TYPES,
  type PodcastEvidenceStatus,
  type PodcastGenderMarker,
  type PodcastRegistryType,
} from "@/lib/db/schema/podcast-universe"
import {
  enqueueChannelVerify,
  startGuestExtraction,
  startIncrementalCrawl,
  startInitialCrawl,
} from "@/lib/podcast-universe/jobs"
import * as identity from "@/lib/podcast-universe/identity-actions"
import { isUuid } from "@/lib/podcast-universe/queries"
import { isPodcastUniverseEnabled, PODCAST_UNIVERSE_DISABLED_MESSAGE } from "@/lib/podcast-universe/flag"

/**
 * Podcast Universe admin actions. A Server Action is a public POST endpoint —
 * the page's own `requireAdmin()` guards only the render — so EVERY action
 * re-checks the role itself:
 *   • crawl / verify / sync / pause / registry type → EDITOR
 *   • paid AI extraction and identity corrections    → ADMIN (B16 "authorized admin")
 */
export type PuActionResult = { ok: true; message: string } | { ok: false; error: string }

const CHANNELS = "/admin/podcast-universe/channels"

/** Every action refuses while the feature flag is off (lib/podcast-universe/flag.ts). */
const DISABLED: PuActionResult = { ok: false, error: PODCAST_UNIVERSE_DISABLED_MESSAGE }

/** Generic on purpose: a malformed id never reaches SQL and never echoes back. */
const BAD_ID: PuActionResult = { ok: false, error: "معرّف غير صالح" }
/** guests.id / guest_candidates.id are TEXT (UUID-shaped in practice); empty = unlink. */
const KHAT_ID_RE = /^[A-Za-z0-9_-]{1,64}$/

function fail(e: unknown): PuActionResult {
  return { ok: false, error: e instanceof Error ? e.message : String(e) }
}

export async function verifyChannelAction(channelId: string): Promise<PuActionResult> {
  if (!isPodcastUniverseEnabled()) return DISABLED
  const auth = await requireActionRole("EDITOR")
  if (!auth.ok) return { ok: false, error: auth.error }
  if (!isUuid(channelId)) return BAD_ID
  try {
    const r = await enqueueChannelVerify(channelId)
    if (!r.ok) return r
    revalidatePath(CHANNELS)
    return { ok: true, message: r.alreadyRunning ? "التحقق قيد التنفيذ مسبقاً" : "أُضيف التحقق إلى الطابور" }
  } catch (e) {
    return fail(e)
  }
}

export async function initialCrawlAction(channelId: string): Promise<PuActionResult> {
  if (!isPodcastUniverseEnabled()) return DISABLED
  const auth = await requireActionRole("EDITOR")
  if (!auth.ok) return { ok: false, error: auth.error }
  if (!isUuid(channelId)) return BAD_ID
  try {
    const r = await startInitialCrawl(channelId)
    if (!r.ok) return r
    revalidatePath(CHANNELS)
    return { ok: true, message: r.alreadyRunning ? "الزحف الأولي قيد التنفيذ مسبقاً" : "أُضيف الزحف الأولي إلى الطابور" }
  } catch (e) {
    return fail(e)
  }
}

export async function incrementalSyncAction(channelId: string): Promise<PuActionResult> {
  if (!isPodcastUniverseEnabled()) return DISABLED
  const auth = await requireActionRole("EDITOR")
  if (!auth.ok) return { ok: false, error: auth.error }
  if (!isUuid(channelId)) return BAD_ID
  try {
    const r = await startIncrementalCrawl(channelId)
    if (!r.ok) return r
    revalidatePath(CHANNELS)
    return { ok: true, message: r.alreadyRunning ? "المزامنة قيد التنفيذ مسبقاً" : "أُضيفت المزامنة إلى الطابور" }
  } catch (e) {
    return fail(e)
  }
}

export async function setPausedAction(channelId: string, paused: boolean): Promise<PuActionResult> {
  if (!isPodcastUniverseEnabled()) return DISABLED
  const auth = await requireActionRole("EDITOR")
  if (!auth.ok) return { ok: false, error: auth.error }
  if (!isUuid(channelId)) return BAD_ID
  try {
    await db!.update(podcastChannels).set({ paused, updated_at: new Date() }).where(eq(podcastChannels.id, channelId))
    revalidatePath(CHANNELS)
    return { ok: true, message: paused ? "أُوقفت القناة — لن يبدأ أي زحف لها" : "استؤنفت القناة" }
  } catch (e) {
    return fail(e)
  }
}

export async function setRegistryTypeAction(channelId: string, type: string): Promise<PuActionResult> {
  if (!isPodcastUniverseEnabled()) return DISABLED
  const auth = await requireActionRole("EDITOR")
  if (!auth.ok) return { ok: false, error: auth.error }
  if (!isUuid(channelId)) return BAD_ID
  if (!(PODCAST_REGISTRY_TYPES as readonly string[]).includes(type)) return { ok: false, error: "نوع غير معروف" }
  try {
    await db!.transaction(async (tx) => {
      await tx
        .update(podcastChannels)
        .set({ registry_type: type as PodcastRegistryType, updated_at: new Date() })
        .where(eq(podcastChannels.id, channelId))
      // Becoming CORE_INTERVIEW re-opens its long-form episodes that were
      // skipped only because the channel was not core (Decision 11). Leaving
      // core never deletes or rewrites extraction results.
      if (type === "core_interview") {
        await tx.execute(
          sql`
            UPDATE podcast_episodes SET guest_extraction_status = 'pending', updated_at = now()
            WHERE channel_id = ${channelId} AND duration_class = 'core_longform'
              AND guest_extraction_status = 'skipped' AND guest_extraction_note IS NULL`,
        )
      }
    })
    revalidatePath(CHANNELS)
    return { ok: true, message: "حُدّث نوع القناة" }
  } catch (e) {
    return fail(e)
  }
}

export async function startExtractionAction(budgetUsd: number): Promise<PuActionResult> {
  if (!isPodcastUniverseEnabled()) return DISABLED
  const auth = await requireActionRole("ADMIN")
  if (!auth.ok) return { ok: false, error: auth.error }
  try {
    const r = await startGuestExtraction(budgetUsd)
    if (!r.ok) return r
    revalidatePath(CHANNELS)
    return { ok: true, message: r.alreadyRunning ? "الاستخراج قيد التنفيذ مسبقاً" : `بدأ الاستخراج — السقف الكلي $${budgetUsd.toFixed(2)}` }
  } catch (e) {
    return fail(e)
  }
}

// ─── Identity corrections (B16) — ADMIN, audited ─────────────────────────

async function identityAction(
  personId: string,
  run: (actor: string) => Promise<identity.ActionOutcome>,
): Promise<PuActionResult> {
  const auth = await requireActionRole("ADMIN")
  if (!auth.ok) return { ok: false, error: auth.error }
  if (!isUuid(personId)) return BAD_ID
  try {
    const r = await run(auth.user.id)
    revalidatePath(`/admin/podcast-universe/guests/${personId}`)
    if (r.ok && r.personId && r.personId !== personId) revalidatePath(`/admin/podcast-universe/guests/${r.personId}`)
    revalidatePath("/admin/podcast-universe/guests")
    return r.ok ? { ok: true, message: r.message } : r
  } catch (e) {
    return fail(e)
  }
}

export async function addAliasAction(personId: string, alias: string) {
  if (!isPodcastUniverseEnabled()) return DISABLED
  return identityAction(personId, (actor) => identity.addAlias(personId, alias, actor))
}
export async function unlinkAppearanceAction(personId: string, appearanceId: string, note: string) {
  if (!isPodcastUniverseEnabled()) return DISABLED
  if (!isUuid(appearanceId)) return BAD_ID
  return identityAction(personId, (actor) => identity.unlinkAppearance(appearanceId, note, actor))
}
export async function mergeIntoAction(personId: string, targetId: string, note: string) {
  if (!isPodcastUniverseEnabled()) return DISABLED
  if (!isUuid(targetId.trim())) return BAD_ID
  return identityAction(personId, (actor) => identity.mergePeople(personId, targetId.trim(), note, actor))
}
export async function splitAction(personId: string, appearanceIds: string[], newName: string, note: string) {
  if (!isPodcastUniverseEnabled()) return DISABLED
  if (!Array.isArray(appearanceIds) || !appearanceIds.every(isUuid)) return BAD_ID
  return identityAction(personId, (actor) => identity.splitPerson(personId, appearanceIds, newName, note, actor))
}
export async function linkKhatGuestAction(personId: string, guestId: string) {
  if (!isPodcastUniverseEnabled()) return DISABLED
  if (guestId.trim() && !KHAT_ID_RE.test(guestId.trim())) return BAD_ID
  return identityAction(personId, (actor) => identity.linkKhatGuest(personId, guestId.trim() || null, actor))
}
export async function linkCandidateAction(personId: string, candidateId: string) {
  if (!isPodcastUniverseEnabled()) return DISABLED
  if (candidateId.trim() && !KHAT_ID_RE.test(candidateId.trim())) return BAD_ID
  return identityAction(personId, (actor) => identity.linkGuestCandidate(personId, candidateId.trim() || null, actor))
}
export async function setNationalityAction(personId: string, code: string, status: PodcastEvidenceStatus, note: string) {
  if (!isPodcastUniverseEnabled()) return DISABLED
  return identityAction(personId, (actor) => identity.setNationality(personId, code || null, status, note, actor))
}
export async function setGenderAction(personId: string, marker: PodcastGenderMarker, status: PodcastEvidenceStatus, note: string) {
  if (!isPodcastUniverseEnabled()) return DISABLED
  return identityAction(personId, (actor) => identity.setGender(personId, marker, status, note, actor))
}
export async function markReviewedAction(personId: string, note: string) {
  if (!isPodcastUniverseEnabled()) return DISABLED
  return identityAction(personId, (actor) => identity.markReviewed(personId, note, actor))
}

// ─── «مراجعة الجنسية» (M1 closeout) — any EDITOR+, audited ───────────────

export async function reviewNationalityAction(
  personId: string,
  decision: identity.NationalityReviewDecision,
  note: string,
): Promise<PuActionResult> {
  if (!isPodcastUniverseEnabled()) return DISABLED
  const auth = await requireActionRole("EDITOR")
  if (!auth.ok) return { ok: false, error: auth.error }
  if (!isUuid(personId)) return BAD_ID
  if (!(identity.NATIONALITY_REVIEW_DECISIONS as readonly string[]).includes(decision)) return { ok: false, error: "قرار غير معروف" }
  try {
    const r = await identity.reviewNationality(personId, decision, String(note ?? "").slice(0, 1000), auth.user.id)
    revalidatePath("/admin/podcast-universe/guests/review")
    revalidatePath(`/admin/podcast-universe/guests/${personId}`)
    return r.ok ? { ok: true, message: r.message } : r
  } catch (e) {
    return fail(e)
  }
}

// ─── host_names (Addendum 2 c) — EDITOR, manual ──────────────────────────

/** Add (or remove) a host name on a channel. A host is then never extracted as its guest. */
export async function setHostNameAction(channelId: string, name: string, remove = false): Promise<PuActionResult> {
  if (!isPodcastUniverseEnabled()) return DISABLED
  const auth = await requireActionRole("EDITOR")
  if (!auth.ok) return { ok: false, error: auth.error }
  if (!isUuid(channelId)) return BAD_ID
  const clean = String(name ?? "").trim().replace(/\s+/g, " ")
  if (!clean || clean.length > 120) return { ok: false, error: "اسم غير صالح" }
  try {
    await db!.execute(
      remove
        ? sql`UPDATE podcast_channels SET host_names = array_remove(host_names, ${clean}), updated_at = now() WHERE id = ${channelId}::uuid`
        : sql`UPDATE podcast_channels SET host_names = CASE WHEN ${clean} = ANY(host_names) THEN host_names ELSE array_append(host_names, ${clean}) END, updated_at = now() WHERE id = ${channelId}::uuid`,
    )
    revalidatePath(CHANNELS)
    return { ok: true, message: remove ? `أُزيل «${clean}» من المقدمين` : `أُضيف «${clean}» إلى المقدمين` }
  } catch (e) {
    return fail(e)
  }
}

/** Program-scoped host (only episodes whose title contains `program`). EDITOR. */
export async function setProgramHostAction(channelId: string, program: string, name: string, remove = false): Promise<PuActionResult> {
  if (!isPodcastUniverseEnabled()) return DISABLED
  const auth = await requireActionRole("EDITOR")
  if (!auth.ok) return { ok: false, error: auth.error }
  if (!isUuid(channelId)) return BAD_ID
  const prog = String(program ?? "").trim()
  const host = String(name ?? "").trim()
  if (!prog || !host || prog.length > 120 || host.length > 120) return { ok: false, error: "اسم غير صالح" }
  try {
    const { setProgramHost } = await import("@/lib/podcast-universe/hosts-admin")
    await setProgramHost(channelId, prog, host, remove)
    revalidatePath(CHANNELS)
    return { ok: true, message: remove ? `أُزيل «${host}» من مقدمي «${prog}»` : `أُضيف «${host}» مقدّماً لـ«${prog}»` }
  } catch (e) {
    return fail(e)
  }
}
