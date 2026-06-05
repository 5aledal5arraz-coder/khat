import { NextRequest, NextResponse } from "next/server"
import { requireAdminAPI, validateMutation, errorResponse } from "@/lib/api-utils"
import {
  getPreparationById,
  setPreparationSection,
  setSectionStatus,
  forceSetStatus,
  computeForceStatus,
  isResearchUsable,
  clearLiveToken,
} from "@/lib/preparation/queries"
import { enforcePreparationRateLimit } from "@/lib/preparation/rate-limit"
import { PREPARATION_STATUS_RANK } from "@/types/preparation"
import {
  generateSection,
  type GenerateableSection,
} from "@/lib/ai/preparation/generate"
import type { PreparationSectionKey } from "@/types/preparation"

export const maxDuration = 120
export const dynamic = "force-dynamic"

const VALID_SECTIONS: PreparationSectionKey[] = [
  "executive_summary",
  "knowledge_bank",
  "guest_intelligence",
  "conversation_axes",
  "episode_flow",
  "question_system",
  "host_instructions",
  "quotes_references",
  "viral_moments",
]

/**
 * Regenerate a single section. Body: { section: PreparationSectionKey }
 *
 * Refuses to run unless research is usable. Also demotes `reviewed` /
 * `approved` back to `prepared` — regenerating even one section invalidates
 * the prior human signoff, so we clear it explicitly rather than silently.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = await requireAdminAPI()
  if (authError) return authError
  const mutErr = validateMutation(request)
  if (mutErr) return mutErr
  const rateErr = await enforcePreparationRateLimit("regenerate")
  if (rateErr) return rateErr

  const { id } = await params
  let body: { section?: string }
  try {
    body = await request.json()
  } catch {
    return errorResponse("طلب غير صالح", 400)
  }
  const section = body.section as PreparationSectionKey | undefined
  if (!section || !VALID_SECTIONS.includes(section)) {
    return errorResponse("القسم غير صالح", 400)
  }

  const prep = await getPreparationById(id)
  if (!prep) return errorResponse("غير موجود", 404)

  // Hard gate: must have a usable research foundation.
  if (!isResearchUsable(prep)) {
    return errorResponse(
      "يجب تشغيل بحث قابل للاستخدام أولاً قبل إعادة توليد الأقسام",
      400,
    )
  }

  const wasReviewedOrHigher =
    PREPARATION_STATUS_RANK[prep.status] >= PREPARATION_STATUS_RANK["reviewed"]
  const demotingFromApproved = prep.status === "approved"

  // Demote human signoff BEFORE the section write. The subsequent auto-bump
  // in setPreparationSection is "never demote", so the write itself won't
  // walk the status back up.
  if (wasReviewedOrHigher) {
    await forceSetStatus(id, "prepared")
  }
  // Any outstanding live URL refers to the old signed-off content. Clear
  // the token so a host cannot load stale content against new sections.
  if (demotingFromApproved) {
    await clearLiveToken(id)
  }

  await setSectionStatus(id, section, "generating")
  try {
    const fresh = await getPreparationById(id)
    if (!fresh) return errorResponse("غير موجود", 404)
    const data = await generateSection(section as GenerateableSection, fresh)
    const updated = await setPreparationSection(id, section, data, fresh.sections_status)

    // Sanity cap: if the user regenerated while at reviewed/approved, make
    // absolutely sure the final status is capped at `prepared`.
    if (updated) {
      const target = computeForceStatus(updated, "prepared")
      if (target !== updated.status) {
        const bumped = await forceSetStatus(id, target)
        return NextResponse.json({
          preparation: bumped,
          review_lost: wasReviewedOrHigher,
        })
      }
    }

    return NextResponse.json({
      preparation: updated,
      review_lost: wasReviewedOrHigher,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "فشل التوليد"
    await setSectionStatus(id, section, "error", message)
    return errorResponse(message, 500)
  }
}
