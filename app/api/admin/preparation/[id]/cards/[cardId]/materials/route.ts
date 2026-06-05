import { NextRequest, NextResponse } from "next/server"
import { requireAdminAPI, errorResponse, validationErrorResponse, notFoundResponse } from "@/lib/api-utils"
import { getMaterialsByCard, createMaterial, updateMaterial, deleteMaterial } from "@/lib/collaboration/cards"

/** GET — list materials for a card */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; cardId: string }> }
) {
  const authError = await requireAdminAPI()
  if (authError) return authError

  const { cardId } = await params

  try {
    const materials = await getMaterialsByCard(cardId)
    return NextResponse.json(materials)
  } catch {
    return errorResponse("فشل في جلب المواد", 500)
  }
}

/** POST — add a material to a card */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; cardId: string }> }
) {
  const authError = await requireAdminAPI()
  if (authError) return authError

  const { cardId } = await params

  try {
    const body = await req.json()

    if (!body.type || typeof body.type !== "string") {
      return validationErrorResponse("type مطلوب")
    }
    if (!body.title || typeof body.title !== "string") {
      return validationErrorResponse("title مطلوب")
    }
    if (!body.content || typeof body.content !== "string") {
      return validationErrorResponse("content مطلوب")
    }

    const material = await createMaterial({ ...body, card_id: cardId }, { ai_generated: false })
    return NextResponse.json(material, { status: 201 })
  } catch {
    return errorResponse("فشل في إضافة المادة", 500)
  }
}

/** PATCH — update a material's title/content */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; cardId: string }> }
) {
  const authError = await requireAdminAPI()
  if (authError) return authError

  try {
    const body = await req.json()
    if (!body.id || typeof body.id !== "string") {
      return validationErrorResponse("id مطلوب")
    }

    const updates: { title?: string; content?: string } = {}
    if (typeof body.title === "string") updates.title = body.title.trim()
    if (typeof body.content === "string") updates.content = body.content.trim()

    if (Object.keys(updates).length === 0) {
      return validationErrorResponse("لا توجد تحديثات")
    }

    const material = await updateMaterial(body.id, updates)
    if (!material) return notFoundResponse()
    return NextResponse.json(material)
  } catch {
    return errorResponse("فشل في تحديث المادة", 500)
  }
}

/** DELETE — remove a material (pass ?id=xxx) */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; cardId: string }> }
) {
  const authError = await requireAdminAPI()
  if (authError) return authError

  const materialId = req.nextUrl.searchParams.get("id")
  if (!materialId) return validationErrorResponse("id مطلوب")

  try {
    const ok = await deleteMaterial(materialId)
    if (!ok) return notFoundResponse()
    return NextResponse.json({ success: true })
  } catch {
    return errorResponse("فشل في حذف المادة", 500)
  }
}
