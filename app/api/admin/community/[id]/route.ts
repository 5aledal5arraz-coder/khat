import { NextRequest, NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { communityContributions } from "@/lib/db/schema/community"
import { requireAdminAPI, getAdminAuthUser } from "@/lib/api-utils"
import { getCommunityContributionById, updateCommunityStatus } from "@/lib/community/queries"
import { logActivity, deleteCrmForSubject } from "@/lib/crm"
import type { CommunityContributionStatus } from "@/types/database"

const VALID: CommunityContributionStatus[] = ["new", "reviewing", "accepted", "routed", "declined"]
const LABEL: Record<CommunityContributionStatus, string> = {
  new: "جديدة",
  reviewing: "قيد المراجعة",
  accepted: "مقبولة",
  routed: "مُوجّهة",
  declined: "مرفوضة",
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authError = await requireAdminAPI()
  if (authError) return authError
  const { id } = await params
  const body = (await req.json().catch(() => ({}))) as { status?: string }
  if (!body.status || !VALID.includes(body.status as CommunityContributionStatus)) {
    return NextResponse.json({ error: "حالة غير صالحة" }, { status: 400 })
  }
  const prev = await getCommunityContributionById(id)
  await updateCommunityStatus(id, body.status as CommunityContributionStatus)
  if (!prev || prev.status !== body.status) {
    const user = await getAdminAuthUser()
    await logActivity("community", id, {
      type: "status_changed",
      summary: `تغيّرت الحالة: ${prev ? LABEL[prev.status] : "—"} ← ${LABEL[body.status as CommunityContributionStatus]}`,
      actor: user ? `admin:${user.email}` : "admin",
      metadata: { from: prev?.status ?? null, to: body.status },
    })
  }
  return NextResponse.json({ success: true })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authError = await requireAdminAPI()
  if (authError) return authError
  const { id } = await params
  if (!db) return NextResponse.json({ error: "خطأ في الخادم" }, { status: 500 })
  await db.delete(communityContributions).where(eq(communityContributions.id, id))
  await deleteCrmForSubject("community", id).catch(() => {})
  return NextResponse.json({ success: true })
}
