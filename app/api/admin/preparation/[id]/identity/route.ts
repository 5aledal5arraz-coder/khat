import { NextRequest, NextResponse } from "next/server"
import {
  getAdminAuthUser,
  requireAdminAPI,
  validateMutation,
  errorResponse,
} from "@/lib/api-utils"
import {
  getPreparationById,
  setGuestIdentity,
} from "@/lib/preparation/queries"
import { enforcePreparationRateLimit } from "@/lib/preparation/rate-limit"
import type { PreparationGuestIdentity } from "@/types/preparation"

export const dynamic = "force-dynamic"

/**
 * Set or overwrite the confirmed guest identity on an existing preparation.
 *
 * Used by the re-identify flow for legacy drafts that were created before
 * the identity gate existed, and any time the admin wants to change their
 * pick after creation.
 *
 * Body:
 *   {
 *     name: string,            // required
 *     description: string,     // required
 *     source_provider: "gemini_web" | "youtube" | "manual",
 *     source_url?: string | null,
 *     source_title?: string | null,
 *     avatar_url?: string | null,
 *     profile_link?: string | null,
 *   }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = await requireAdminAPI()
  if (authError) return authError
  const mutErr = validateMutation(request)
  if (mutErr) return mutErr
  // Reuse identify budget — this endpoint is in the same workflow step.
  const rateErr = await enforcePreparationRateLimit("identify")
  if (rateErr) return rateErr

  const user = await getAdminAuthUser()
  if (!user) return errorResponse("غير مصرح", 401)

  const { id } = await params
  const prep = await getPreparationById(id)
  if (!prep) return errorResponse("غير موجود", 404)

  let body: Partial<PreparationGuestIdentity>
  try {
    body = await request.json()
  } catch {
    return errorResponse("طلب غير صالح", 400)
  }

  if (!body.name || typeof body.name !== "string" || body.name.trim().length < 2) {
    return errorResponse("الاسم مطلوب", 422)
  }
  if (
    !body.description ||
    typeof body.description !== "string" ||
    body.description.trim().length < 10
  ) {
    return errorResponse("الوصف مطلوب (10 أحرف على الأقل)", 422)
  }
  const provider = body.source_provider
  if (provider !== "gemini_web" && provider !== "youtube" && provider !== "manual") {
    return errorResponse("مصدر الهوية غير صالح", 422)
  }

  const identity: PreparationGuestIdentity = {
    name: body.name.trim(),
    description: body.description.trim(),
    source_provider: provider,
    source_url: typeof body.source_url === "string" ? body.source_url : null,
    source_title: typeof body.source_title === "string" ? body.source_title : null,
    avatar_url: typeof body.avatar_url === "string" ? body.avatar_url : null,
    profile_link:
      typeof body.profile_link === "string" ? body.profile_link : prep.guest_profile_link,
    confirmed_at: new Date().toISOString(),
    confirmed_by: user.id,
  }

  const updated = await setGuestIdentity(id, identity)
  if (!updated) return errorResponse("فشل الحفظ", 500)
  return NextResponse.json({ preparation: updated })
}
