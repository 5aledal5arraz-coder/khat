"use server"

/**
 * Production-readiness fix sprint #2.9 — bulk convert action.
 *
 * Iterates every `approved` candidate in a season, calls the existing
 * `convertEpisodeToPreparation` primitive on each, and returns a
 * per-card success/failure list so the UI can show partial progress.
 *
 * No new pipeline — this is a thin orchestrator on top of the
 * primitive that the existing `convertV2CardToPreparationAction`
 * already uses.
 */

import { revalidatePath } from "next/cache"
import { eq, and } from "drizzle-orm"
import { db } from "@/lib/db"
import { khatMapEpisodeCandidates } from "@/lib/db/schema/khat-map"
import { requireActionRole, getAdminAuthUser } from "@/lib/api-utils"
import { convertEpisodeToPreparation } from "@/lib/khat-map/conversion/to-preparation"

export interface BulkConvertResult {
  ok: boolean
  message: string
  total_attempted: number
  total_succeeded: number
  per_card: Array<{
    candidate_id: string
    title: string
    status: "converted" | "skipped_existing" | "failed"
    reason?: string
    preparation_id?: string
  }>
}

export async function bulkConvertApprovedAction(
  seasonId: string,
): Promise<BulkConvertResult> {
  const gate = await requireActionRole("EDITOR")
  if (!gate.ok) {
    return {
      ok: false,
      message: gate.error,
      total_attempted: 0,
      total_succeeded: 0,
      per_card: [],
    }
  }
  const user = await getAdminAuthUser()
  if (!user || !db) {
    return {
      ok: false,
      message: "غير مصرح أو قاعدة البيانات غير متوفرة.",
      total_attempted: 0,
      total_succeeded: 0,
      per_card: [],
    }
  }

  // Pick up everything that's `approved` and not already converted.
  const cards = await db
    .select({
      id: khatMapEpisodeCandidates.id,
      title: khatMapEpisodeCandidates.working_title,
      status: khatMapEpisodeCandidates.status,
      converted_preparation_id:
        khatMapEpisodeCandidates.converted_preparation_id,
    })
    .from(khatMapEpisodeCandidates)
    .where(
      and(
        eq(khatMapEpisodeCandidates.season_id, seasonId),
        eq(khatMapEpisodeCandidates.status, "approved"),
      ),
    )

  if (cards.length === 0) {
    return {
      ok: true,
      message: "لا توجد حلقات بحالة 'معتمدة' للتحويل.",
      total_attempted: 0,
      total_succeeded: 0,
      per_card: [],
    }
  }

  const per_card: BulkConvertResult["per_card"] = []
  let succeeded = 0

  for (const card of cards) {
    try {
      const result = await convertEpisodeToPreparation({
        episode_candidate_id: card.id,
        admin_id: user.id,
      })
      if (!result.ok) {
        per_card.push({
          candidate_id: card.id,
          title: card.title,
          status: "failed",
          reason: result.message,
        })
        continue
      }
      per_card.push({
        candidate_id: card.id,
        title: card.title,
        status: result.was_existing ? "skipped_existing" : "converted",
        preparation_id: result.link.target_id,
      })
      succeeded++
    } catch (err) {
      per_card.push({
        candidate_id: card.id,
        title: card.title,
        status: "failed",
        reason: err instanceof Error ? err.message : "تعذّر التحويل.",
      })
    }
  }

  revalidatePath(`/admin/khat-brain/seasons/${seasonId}`)
  revalidatePath(`/admin/khat-brain/seasons/${seasonId}`)

  return {
    ok: succeeded > 0,
    message:
      succeeded === cards.length
        ? `تم تحويل ${succeeded} حلقة إلى مرحلة الإعداد.`
        : `تم تحويل ${succeeded}/${cards.length} حلقة. تحقق من الفشلات أدناه.`,
    total_attempted: cards.length,
    total_succeeded: succeeded,
    per_card,
  }
}
