import { NextRequest, NextResponse } from "next/server"
import { deleteNewsletterSubscriber } from "@/lib/admin/queries"
import { requireAdminAPI } from "@/lib/api-utils"

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAdminAPI("EDITOR")
  if (authError) return authError
  try {
    const { id } = await params

    const result = await deleteNewsletterSubscriber(id)

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting newsletter subscriber:", error)
    return NextResponse.json(
      { error: "حدث خطأ أثناء حذف المشترك" },
      { status: 500 }
    )
  }
}
