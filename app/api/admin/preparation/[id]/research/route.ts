import { NextRequest, NextResponse } from "next/server"
import { requireAdminAPI, validateMutation, errorResponse } from "@/lib/api-utils"
import {
  getPreparationById,
  setPreparationSection,
  setSectionStatus,
  computeForceStatus,
  forceSetStatus,
  clearLiveToken,
  writeResearchErrorState,
} from "@/lib/preparation/queries"
import { enforcePreparationRateLimit } from "@/lib/preparation/rate-limit"
import { PREPARATION_STATUS_RANK } from "@/types/preparation"
import { runPreparationResearch } from "@/lib/ai/preparation/research"
import { GeminiJsonError } from "@/lib/ai/preparation/research/gemini"
import type { PreparationInputs } from "@/types/preparation"

export const maxDuration = 300
export const dynamic = "force-dynamic"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = await requireAdminAPI()
  if (authError) return authError
  const mutErr = validateMutation(request)
  if (mutErr) return mutErr
  const rateErr = await enforcePreparationRateLimit("research")
  if (rateErr) return rateErr

  const { id } = await params
  const prep = await getPreparationById(id)
  if (!prep) return errorResponse("غير موجود", 404)

  // HARD GATE: no research without a confirmed identity. This prevents
  // wrong-person research on a raw name alone. The admin must have gone
  // through the /identify candidate picker first (either in the creation
  // wizard or via the re-identify flow for legacy drafts).
  if (!prep.guest_identity) {
    return errorResponse(
      "يجب تأكيد هوية الضيف قبل تشغيل البحث",
      400,
    )
  }

  // Re-running research invalidates everything above `researched`. We capture
  // the pre-run status so we know whether a human signoff is about to be lost.
  const wasReviewedOrHigher =
    PREPARATION_STATUS_RANK[prep.status] >= PREPARATION_STATUS_RANK["reviewed"]

  await setSectionStatus(id, "research", "generating")

  // Use the confirmed canonical name + typed description. These are what
  // drive the research queries — raw `guest_name` alone is never used.
  const inputs: PreparationInputs = {
    title: prep.title,
    guest_name: prep.guest_identity.name,
    guest_description: prep.guest_description,
    guest_profile_link: prep.guest_profile_link,
    short_description: prep.short_description,
    episode_goal: prep.episode_goal,
    key_questions: prep.key_questions,
    tone_type: prep.tone_type,
    focus_mode: prep.focus_mode,
    expected_duration_min: prep.expected_duration_min,
    depth_level: prep.depth_level,
    boldness_level: prep.boldness_level,
    content_focus: prep.content_focus,
  }

  try {
    const research = await runPreparationResearch(inputs)

    // Pre-compute usability from the raw payload BEFORE writing anything.
    // The old "write ready → flip to error" sequence left a brief window
    // where a concurrent reader saw sections_status.research="ready" with
    // empty sources. Now we write the correct target state in one UPDATE.
    const willBeUsable =
      Array.isArray(research.sources) &&
      research.sources.length > 0 &&
      Array.isArray(research.claims) &&
      research.claims.length > 0

    // Re-running research always invalidates human signoff above `researched`.
    // Capture whether we're demoting an `approved` record so we can nuke the
    // live token in the same transaction boundary.
    const demotingFromApproved = prep.status === "approved"

    if (!willBeUsable) {
      const empty = research.sources.length === 0
      const reason = empty
        ? "لم يتم العثور على أي مصادر — البحث فارغ."
        : "المُدقق رفض جميع الادعاءات — لا يوجد بحث قابل للاستخدام."

      // Single atomic write: research_data + sections_status.research = error.
      const afterErrorWrite = await writeResearchErrorState(
        id,
        research,
        reason,
        prep.sections_status,
      )
      if (!afterErrorWrite) return errorResponse("فشل حفظ البحث", 500)

      // Force-demote to whatever statusFromData returns (will be draft since
      // research isn't usable). Capped at "researched" for safety.
      const forced = computeForceStatus(afterErrorWrite, "researched")
      if (forced !== afterErrorWrite.status) {
        await forceSetStatus(id, forced)
      }

      // Any outstanding live token referred to the now-invalidated content.
      if (demotingFromApproved) {
        await clearLiveToken(id)
      }

      const refreshed = await getPreparationById(id)
      return NextResponse.json({
        preparation: refreshed,
        research_usable: false,
        warning: reason,
        review_lost: wasReviewedOrHigher,
      })
    }

    // Happy path: research is usable. setPreparationSection marks the
    // research section as "ready" and auto-bumps; we then force-cap at
    // "researched" because the existing editorial sections (if any) were
    // produced against the previous corpus and must NOT be counted.
    const afterWrite = await setPreparationSection(
      id,
      "research",
      research,
      prep.sections_status,
    )
    if (!afterWrite) return errorResponse("فشل حفظ البحث", 500)

    const forced = computeForceStatus(afterWrite, "researched")
    const finalRecord =
      forced !== afterWrite.status ? await forceSetStatus(id, forced) : afterWrite

    // Re-running research invalidated signoff — nuke the live token so any
    // outstanding live URL stops working immediately.
    if (demotingFromApproved) {
      await clearLiveToken(id)
    }

    return NextResponse.json({
      preparation: finalRecord,
      research_usable: true,
      review_lost: wasReviewedOrHigher,
    })
  } catch (err) {
    // Gemini JSON failures are a distinct class — we want a clean Arabic
    // message for the UI and a structured log for the server. The raw
    // excerpt is NEVER leaked to the client because it can contain the
    // model's partial chain of thought.
    if (err instanceof GeminiJsonError) {
      console.error(
        `[preparation/research route] GeminiJsonError label=${err.label} stage=${err.stage} finish=${err.finishReason ?? "n/a"} parseMessage=${err.parseMessage}`,
      )
      console.error(
        `[preparation/research route] GeminiJsonError raw excerpt:`,
        err.rawExcerpt || "(empty)",
      )
      const userMessage =
        err.label === "synthesize"
          ? "فشل بناء بحث منظم (Gemini أعاد JSON غير صالح). حاول تشغيل البحث مرة أخرى. إذا استمرت المشكلة، جرّب تبسيط وصف الحلقة أو تقليل عدد المصادر."
          : err.label === "verify"
            ? "فشل المُدقّق في تصنيف الادعاءات (Gemini أعاد JSON غير صالح). حاول مرة أخرى."
            : "فشل نموذج Gemini في إرجاع JSON صالح. حاول مرة أخرى."
      await setSectionStatus(
        id,
        "research",
        "error",
        `${err.label}:${err.stage}:${err.parseMessage}`.slice(0, 300),
      )
      return errorResponse(userMessage, 502)
    }

    const message = err instanceof Error ? err.message : "فشل البحث"
    console.error("[preparation/research route] unexpected error:", err)
    await setSectionStatus(id, "research", "error", message)
    const status = /GEMINI_API_KEY/i.test(message) ? 412 : 500
    return errorResponse(
      status === 412 ? message : "فشل البحث — حدث خطأ داخلي. حاول مرة أخرى.",
      status,
    )
  }
}
