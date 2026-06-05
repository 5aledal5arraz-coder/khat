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
  GENERATION_ORDER,
  type GenerateableSection,
} from "@/lib/ai/preparation/generate"

export const maxDuration = 300
export const dynamic = "force-dynamic"

/**
 * Full pipeline: generates every section in order.
 * Each step re-reads the preparation so later sections can consume
 * earlier ones (e.g. question_system uses episode_flow).
 *
 * Refuses to run unless research is actually usable (sources + claims both
 * present). A full regeneration also demotes `reviewed` / `approved` back to
 * `prepared` because every section will be rewritten — prior signoff is gone.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = await requireAdminAPI()
  if (authError) return authError
  const mutErr = validateMutation(request)
  if (mutErr) return mutErr
  const rateErr = await enforcePreparationRateLimit("generate")
  if (rateErr) return rateErr

  const { id } = await params
  const initial = await getPreparationById(id)
  if (!initial) return errorResponse("غير موجود", 404)

  // Hard gate: the research layer must be genuinely usable. This catches the
  // empty-sources and all-claims-rejected cases that the old check missed.
  if (!isResearchUsable(initial)) {
    return errorResponse(
      "يجب تشغيل بحث قابل للاستخدام أولاً (مصادر وادعاءات غير فارغة) قبل توليد الأقسام",
      400,
    )
  }

  // Capture whether we're about to invalidate a human signoff.
  const wasReviewedOrHigher =
    PREPARATION_STATUS_RANK[initial.status] >= PREPARATION_STATUS_RANK["reviewed"]
  const demotingFromApproved = initial.status === "approved"

  // Demote reviewed/approved to prepared BEFORE any section writes so the
  // UI doesn't briefly lie. The subsequent section writes will keep status
  // at `prepared` via the never-demote auto-bump.
  if (wasReviewedOrHigher) {
    await forceSetStatus(id, "prepared")
  }
  // Any outstanding live URL refers to the old signed-off content. Clear
  // the token in the same boundary so it stops working before any new
  // section gets written.
  if (demotingFromApproved) {
    await clearLiveToken(id)
  }

  const errors: Array<{ section: GenerateableSection; error: string }> = []

  for (const section of GENERATION_ORDER) {
    await setSectionStatus(id, section, "generating")
    try {
      const latest = await getPreparationById(id)
      if (!latest) break
      const data = await generateSection(section, latest)
      await setPreparationSection(id, section, data, latest.sections_status)
    } catch (err) {
      const message = err instanceof Error ? err.message : "فشل التوليد"
      errors.push({ section, error: message })
      await setSectionStatus(id, section, "error", message)
      // Continue with other sections — partial success is still useful.
    }
  }

  // Force a final recompute capped at `prepared`. If any section failed
  // mid-loop, statusFromData will land on `researched` instead.
  const afterLoop = await getPreparationById(id)
  if (afterLoop) {
    const target = computeForceStatus(afterLoop, "prepared")
    if (target !== afterLoop.status) {
      await forceSetStatus(id, target)
    }
  }

  const final = await getPreparationById(id)
  return NextResponse.json({
    preparation: final,
    errors,
    review_lost: wasReviewedOrHigher,
  })
}
