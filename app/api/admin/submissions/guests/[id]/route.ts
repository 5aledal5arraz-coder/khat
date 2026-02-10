import { NextRequest, NextResponse } from "next/server"
import {
  deleteGuestApplication,
  updateGuestApplicationStatus,
} from "@/lib/admin/queries"
import type { GuestApplicationStatus } from "@/types/database"

const VALID_STATUSES: GuestApplicationStatus[] = [
  "new",
  "under_review",
  "accepted",
  "rejected",
  "consider_later",
]

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { status } = body

    if (!status || !VALID_STATUSES.includes(status)) {
      return NextResponse.json({ error: "حالة غير صالحة" }, { status: 400 })
    }

    const result = await updateGuestApplicationStatus(id, status)

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error updating application status:", error)
    return NextResponse.json(
      { error: "حدث خطأ أثناء تحديث الحالة" },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const result = await deleteGuestApplication(id)

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting guest application:", error)
    return NextResponse.json(
      { error: "حدث خطأ أثناء حذف الطلب" },
      { status: 500 }
    )
  }
}
