import { NextRequest, NextResponse } from "next/server"
import { deleteSponsorshipLead, getSponsorshipLeadById, updateSponsorshipStatus } from "@/lib/admin/queries"
import type { SponsorshipStatus } from "@/types/database"
import { requireAdminAPI, getAdminAuthUser } from "@/lib/api-utils"
import { logActivity } from "@/lib/partnership-crm"

const VALID_STATUSES: SponsorshipStatus[] = [
  "new",
  "reviewing",
  "proposal_sent",
  "negotiation",
  "confirmed",
  "active",
  "renewal",
  "declined",
]

const STATUS_LABEL: Record<SponsorshipStatus, string> = {
  new: "جديدة",
  reviewing: "قيد المراجعة",
  proposal_sent: "أُرسل العرض",
  negotiation: "تفاوض",
  confirmed: "مؤكّدة",
  active: "حملة نشطة",
  renewal: "تجديد",
  declined: "مرفوضة",
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAdminAPI()
  if (authError) return authError
  try {
    const { id } = await params
    const body = await request.json()
    const { status } = body

    if (!status || !VALID_STATUSES.includes(status)) {
      return NextResponse.json(
        { error: "حالة غير صالحة" },
        { status: 400 }
      )
    }

    const prev = await getSponsorshipLeadById(id)
    const result = await updateSponsorshipStatus(id, status)

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    if (!prev || prev.status !== status) {
      const user = await getAdminAuthUser()
      const fromLabel = prev ? STATUS_LABEL[prev.status] : "—"
      await logActivity(id, {
        type: "status_changed",
        summary: `تغيّرت الحالة: ${fromLabel} ← ${STATUS_LABEL[status as SponsorshipStatus]}`,
        actor: user ? `admin:${user.email}` : "admin",
        metadata: { from: prev?.status ?? null, to: status },
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error updating sponsorship status:", error)
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
  const authError = await requireAdminAPI()
  if (authError) return authError
  try {
    const { id } = await params

    const result = await deleteSponsorshipLead(id)

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting sponsorship lead:", error)
    return NextResponse.json(
      { error: "حدث خطأ أثناء حذف الطلب" },
      { status: 500 }
    )
  }
}
