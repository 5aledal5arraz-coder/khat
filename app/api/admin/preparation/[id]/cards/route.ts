import { NextRequest, NextResponse } from "next/server"
import { requireAdminAPI, errorResponse, validationErrorResponse } from "@/lib/api-utils"
import { getCardsByPreparation, createCard } from "@/lib/collaboration/cards"
import type { InterviewCardBucket } from "@/types/collaboration"

const VALID_BUCKETS: InterviewCardBucket[] = ["opening", "deep", "escalation", "surprise", "backup", "recovery"]

/** GET — list all interview cards for a preparation */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAdminAPI()
  if (authError) return authError

  const { id } = await params

  try {
    const cards = await getCardsByPreparation(id)
    return NextResponse.json(cards)
  } catch (err) {
    return errorResponse("فشل في جلب البطاقات", 500)
  }
}

/** POST — create a single interview card */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAdminAPI()
  if (authError) return authError

  const { id } = await params

  try {
    const body = await req.json()

    // Validate required fields
    if (!body.section_id || typeof body.section_id !== "string") {
      return validationErrorResponse("section_id مطلوب")
    }
    if (!body.section_label || typeof body.section_label !== "string") {
      return validationErrorResponse("section_label مطلوب")
    }
    if (!body.bucket || !VALID_BUCKETS.includes(body.bucket)) {
      return validationErrorResponse("bucket غير صالح")
    }
    if (!body.short_title || typeof body.short_title !== "string") {
      return validationErrorResponse("short_title مطلوب")
    }
    if (!body.spoken_kuwaiti || typeof body.spoken_kuwaiti !== "string") {
      return validationErrorResponse("spoken_kuwaiti مطلوب")
    }

    const card = await createCard({
      ...body,
      preparation_id: id,
    })

    return NextResponse.json(card, { status: 201 })
  } catch (err) {
    return errorResponse("فشل في إنشاء البطاقة", 500)
  }
}
