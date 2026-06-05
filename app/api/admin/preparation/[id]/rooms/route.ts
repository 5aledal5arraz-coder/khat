import { NextRequest, NextResponse } from "next/server"
import { requireRole, errorResponse, validationErrorResponse } from "@/lib/api-utils"
import { getRoomsByPreparation, createRoom } from "@/lib/collaboration/rooms"

/** GET — list rooms for a preparation */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole("EDITOR")
  if (auth.error) return auth.error

  const { id } = await params

  try {
    const rooms = await getRoomsByPreparation(id)
    return NextResponse.json(rooms)
  } catch {
    return errorResponse("فشل في جلب الغرف", 500)
  }
}

/** POST — create a new collaboration room */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole("EDITOR")
  if (auth.error) return auth.error

  const { id } = await params

  try {
    const body = await req.json()
    if (!body.name || typeof body.name !== "string") {
      return validationErrorResponse("اسم الغرفة مطلوب")
    }

    const room = await createRoom(
      { preparation_id: id, name: body.name.trim().slice(0, 100) },
      auth.user.id,
    )
    return NextResponse.json(room, { status: 201 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : ""
    if (msg.includes("idx_collab_rooms_active_prep")) {
      return errorResponse("يوجد غرفة نشطة بالفعل لهذا التحضير", 409)
    }
    return errorResponse("فشل في إنشاء الغرفة", 500)
  }
}
