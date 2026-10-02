import { NextRequest, NextResponse } from "next/server"
import { requireAdminAPI, validateMutation } from "@/lib/api-utils"
import { setContactMessageRead } from "@/lib/contact/messages"

/** Mark a /contact message read or unread. Body: `{ read: boolean }`. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = await requireAdminAPI("EDITOR")
  if (authError) return authError
  const csrfError = validateMutation(request)
  if (csrfError) return csrfError
  try {
    const { id } = await params
    const body = await request.json().catch(() => ({}))
    if (typeof body?.read !== "boolean") {
      return NextResponse.json({ error: "قيمة غير صالحة" }, { status: 400 })
    }
    const ok = await setContactMessageRead(id, body.read)
    if (!ok) return NextResponse.json({ error: "الرسالة غير موجودة" }, { status: 404 })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error updating contact message:", error)
    return NextResponse.json({ error: "حدث خطأ" }, { status: 500 })
  }
}
