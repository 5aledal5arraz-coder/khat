import { NextRequest, NextResponse } from "next/server"
import { requireAdminAPI } from "@/lib/api-utils"
import { db } from "@/lib/db"
import { thinkerSuggestions } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import type { ThinkerSuggestionStatus } from "@/types/database"

const VALID_STATUSES: ThinkerSuggestionStatus[] = ["new", "reviewing", "approved", "rejected"]

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAdminAPI()
  if (authError) return authError

  const { id } = await params

  let body: { status?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 })
  }

  if (!body.status || !VALID_STATUSES.includes(body.status as ThinkerSuggestionStatus)) {
    return NextResponse.json({ error: "حالة غير صالحة" }, { status: 400 })
  }

  try {
    await db!.update(thinkerSuggestions)
      .set({ status: body.status })
      .where(eq(thinkerSuggestions.id, id))

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Update thinker suggestion error:", error)
    return NextResponse.json({ error: "حدث خطأ" }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAdminAPI()
  if (authError) return authError

  const { id } = await params

  try {
    await db!.delete(thinkerSuggestions).where(eq(thinkerSuggestions.id, id))
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Delete thinker suggestion error:", error)
    return NextResponse.json({ error: "حدث خطأ" }, { status: 500 })
  }
}
