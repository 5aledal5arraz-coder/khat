import { NextRequest, NextResponse } from "next/server"
import { requireAdminAPI, errorResponse, notFoundResponse } from "@/lib/api-utils"
import { getCardById, updateCard, softDeleteCard } from "@/lib/collaboration/cards"

/** GET — single card detail */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; cardId: string }> }
) {
  const authError = await requireAdminAPI()
  if (authError) return authError

  const { cardId } = await params

  try {
    const card = await getCardById(cardId)
    if (!card) return notFoundResponse()
    return NextResponse.json(card)
  } catch {
    return errorResponse("فشل في جلب البطاقة", 500)
  }
}

/** PATCH — update card fields */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; cardId: string }> }
) {
  const authError = await requireAdminAPI()
  if (authError) return authError

  const { cardId } = await params

  try {
    const body = await req.json()
    const card = await updateCard(cardId, body)
    if (!card) return notFoundResponse()
    return NextResponse.json(card)
  } catch {
    return errorResponse("فشل في تحديث البطاقة", 500)
  }
}

/** DELETE — soft-delete a card */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; cardId: string }> }
) {
  const authError = await requireAdminAPI()
  if (authError) return authError

  const { cardId } = await params

  try {
    const ok = await softDeleteCard(cardId)
    if (!ok) return notFoundResponse()
    return NextResponse.json({ success: true })
  } catch {
    return errorResponse("فشل في حذف البطاقة", 500)
  }
}
