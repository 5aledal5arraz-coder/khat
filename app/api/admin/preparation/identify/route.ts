import { NextRequest, NextResponse } from "next/server"
import { requireAdminAPI, validateMutation, errorResponse } from "@/lib/api-utils"
import { enforcePreparationRateLimit } from "@/lib/preparation/rate-limit"
import { identifyGuestCandidates } from "@/lib/ai/preparation/identify"

export const maxDuration = 60
export const dynamic = "force-dynamic"

/**
 * Guest identity disambiguation — step 2 of the creation wizard.
 *
 * POST body:
 *   {
 *     guest_name: string            (required, trimmed)
 *     guest_description: string     (required, ≥ 10 chars — forces real context)
 *     guest_profile_link?: string   (optional, http/https)
 *   }
 *
 * Returns 2–3 candidates with source references. The admin picks one (or
 * rejects all) in the UI. A confirmed pick is written to the preparation
 * row at create time via POST /api/admin/preparation.
 *
 * This route is stateless — it does NOT touch the DB. It exists purely to
 * return candidates for the UI to render before a preparation even exists.
 */
export async function POST(request: NextRequest) {
  const authError = await requireAdminAPI()
  if (authError) return authError
  const mutErr = validateMutation(request)
  if (mutErr) return mutErr
  const rateErr = await enforcePreparationRateLimit("identify")
  if (rateErr) return rateErr

  let body: {
    guest_name?: unknown
    guest_description?: unknown
    guest_profile_link?: unknown
  }
  try {
    body = await request.json()
  } catch {
    return errorResponse("طلب غير صالح", 400)
  }

  const guest_name = typeof body.guest_name === "string" ? body.guest_name.trim() : ""
  const guest_description =
    typeof body.guest_description === "string" ? body.guest_description.trim() : ""
  const rawLink =
    typeof body.guest_profile_link === "string" ? body.guest_profile_link.trim() : ""

  if (!guest_name) {
    return errorResponse("اسم الضيف مطلوب", 422)
  }
  if (!guest_description || guest_description.length < 10) {
    return errorResponse("الوصف مطلوب (10 أحرف على الأقل)", 422)
  }

  let guest_profile_link: string | null = null
  if (rawLink) {
    try {
      const u = new URL(rawLink)
      if (u.protocol !== "http:" && u.protocol !== "https:") {
        return errorResponse("الرابط غير صالح", 422)
      }
      guest_profile_link = u.toString()
    } catch {
      return errorResponse("الرابط غير صالح", 422)
    }
  }

  try {
    const result = await identifyGuestCandidates({
      guest_name,
      guest_description,
      guest_profile_link,
    })
    return NextResponse.json({
      candidates: result.candidates,
      gemini_empty: result.gemini_empty,
      youtube_error: result.youtube_error ?? null,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "فشل البحث عن هوية الضيف"
    const status = /GEMINI_API_KEY/i.test(message) ? 412 : 500
    return errorResponse(message, status)
  }
}
