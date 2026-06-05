import { NextRequest, NextResponse } from "next/server"
import { requireAdminAPI, errorResponse, validationErrorResponse } from "@/lib/api-utils"
import { reorderCards } from "@/lib/collaboration/cards"

/** POST — reorder cards by providing ordered array of IDs */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAdminAPI()
  if (authError) return authError

  const { id } = await params

  try {
    const body = await req.json()
    if (!Array.isArray(body.ordered_ids) || body.ordered_ids.length === 0) {
      return validationErrorResponse("ordered_ids مطلوب كمصفوفة")
    }

    await reorderCards(id, body.ordered_ids)
    return NextResponse.json({ success: true })
  } catch {
    return errorResponse("فشل في إعادة ترتيب البطاقات", 500)
  }
}
