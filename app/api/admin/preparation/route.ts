import { NextRequest, NextResponse } from "next/server"
import { getAdminAuthUser, requireAdminAPI, validateMutation, errorResponse } from "@/lib/api-utils"
import { createPreparation, listPreparations, type PreparationListFilter } from "@/lib/preparation/queries"
import type {
  PreparationInputs,
  PreparationGuestIdentity,
} from "@/types/preparation"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const authError = await requireAdminAPI()
  if (authError) return authError
  const filterParam = request.nextUrl.searchParams.get("filter")
  const filter: PreparationListFilter =
    filterParam === "archived" || filterParam === "all" ? filterParam : "active"
  const items = await listPreparations(filter)
  return NextResponse.json({ items })
}

/**
 * Create a preparation. The client MUST supply a confirmed identity
 * (chosen through the /identify flow) alongside inputs. Research is
 * refused later if this identity is absent — so we reject missing
 * identity at create time instead of silently creating a broken draft.
 */
export async function POST(request: NextRequest) {
  const authError = await requireAdminAPI()
  if (authError) return authError
  const mutErr = validateMutation(request)
  if (mutErr) return mutErr

  const user = await getAdminAuthUser()
  if (!user) return errorResponse("غير مصرح", 401)

  let body: Partial<PreparationInputs> & {
    guest_identity?: Partial<PreparationGuestIdentity> | null
  }
  try {
    body = await request.json()
  } catch {
    return errorResponse("طلب غير صالح", 400)
  }

  // ─── Inputs ────────────────────────────────────────────────────────────────
  const inputs: PreparationInputs = {
    title: (body.title || "").trim(),
    guest_name: body.guest_name?.trim() || null,
    guest_description: body.guest_description?.trim() || null,
    guest_profile_link: body.guest_profile_link?.trim() || null,
    short_description: body.short_description?.trim() || null,
    episode_goal: body.episode_goal?.trim() || null,
    key_questions: Array.isArray(body.key_questions)
      ? body.key_questions.map((q) => String(q).trim()).filter(Boolean)
      : [],
    tone_type: body.tone_type ?? null,
    focus_mode: body.focus_mode ?? null,
    expected_duration_min:
      typeof body.expected_duration_min === "number" ? body.expected_duration_min : null,
    depth_level: typeof body.depth_level === "number" ? body.depth_level : 3,
    boldness_level: typeof body.boldness_level === "number" ? body.boldness_level : 3,
    content_focus: Array.isArray(body.content_focus) ? body.content_focus : [],
  }

  if (!inputs.title) return errorResponse("العنوان مطلوب", 422)
  if (!inputs.guest_name) return errorResponse("اسم الضيف مطلوب", 422)
  if (!inputs.guest_description || inputs.guest_description.length < 10) {
    return errorResponse("وصف الضيف مطلوب (10 أحرف على الأقل)", 422)
  }

  // ─── Confirmed identity ────────────────────────────────────────────────────
  // Hard gate: no creation without a confirmed pick. This prevents a client
  // from bypassing the wizard by calling POST directly with raw inputs.
  const rawIdentity = body.guest_identity
  if (!rawIdentity || typeof rawIdentity !== "object") {
    return errorResponse(
      "يجب تأكيد هوية الضيف قبل الإنشاء — مرشح غير محدد",
      422,
    )
  }
  if (!rawIdentity.name || typeof rawIdentity.name !== "string") {
    return errorResponse("هوية الضيف غير صالحة — الاسم مفقود", 422)
  }
  if (!rawIdentity.description || typeof rawIdentity.description !== "string") {
    return errorResponse("هوية الضيف غير صالحة — الوصف مفقود", 422)
  }

  const provider = rawIdentity.source_provider
  if (provider !== "gemini_web" && provider !== "youtube" && provider !== "manual") {
    return errorResponse("هوية الضيف غير صالحة — المصدر غير معروف", 422)
  }

  const guest_identity: PreparationGuestIdentity = {
    name: rawIdentity.name.trim(),
    description: rawIdentity.description.trim(),
    source_provider: provider,
    source_url:
      typeof rawIdentity.source_url === "string" ? rawIdentity.source_url : null,
    source_title:
      typeof rawIdentity.source_title === "string" ? rawIdentity.source_title : null,
    avatar_url:
      typeof rawIdentity.avatar_url === "string" ? rawIdentity.avatar_url : null,
    profile_link: inputs.guest_profile_link,
    confirmed_at: new Date().toISOString(),
    confirmed_by: user.id,
  }

  // Overwrite guest_name with the confirmed canonical form — research
  // will use the identity blob, but keeping guest_name in sync avoids
  // confusing the list view which still reads it.
  inputs.guest_name = guest_identity.name

  const prep = await createPreparation({
    inputs,
    guest_identity,
    created_by: user.id,
  })
  return NextResponse.json({ preparation: prep }, { status: 201 })
}
