import { NextRequest, NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { communityContributions } from "@/lib/db/schema/community"
import { requireAdminAPI, getAdminAuthUser } from "@/lib/api-utils"
import { getCommunityContributionById, updateCommunityStatus, updateCommunityContribution } from "@/lib/community/queries"
import { notifyContributionOutcome } from "@/lib/community/notify"
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
  const body = (await req.json().catch(() => ({}))) as { status?: string; public_credit?: boolean }

  const hasStatus = typeof body.status === "string"
  const hasCredit = typeof body.public_credit === "boolean"
  if (!hasStatus && !hasCredit) {
    return NextResponse.json({ error: "لا تغيير" }, { status: 400 })
  }
  if (hasStatus && !VALID.includes(body.status as CommunityContributionStatus)) {
    return NextResponse.json({ error: "حالة غير صالحة" }, { status: 400 })
  }

  const prev = await getCommunityContributionById(id)
  if (!prev) return NextResponse.json({ error: "غير موجودة" }, { status: 404 })
  const user = await getAdminAuthUser()
  const actor = user ? `admin:${user.email}` : "admin"

  // ─── Status change ────────────────────────────────────────────────────────
  if (hasStatus && prev.status !== body.status) {
    const next = body.status as CommunityContributionStatus
    await updateCommunityStatus(id, next)
    await logActivity("community", id, {
      type: "status_changed",
      summary: `تغيّرت الحالة: ${LABEL[prev.status]} ← ${LABEL[next]}`,
      actor,
      metadata: { from: prev.status, to: next },
    })
    // Close the loop with the contributor on a real outcome (once).
    if (next === "accepted" || next === "routed") {
      void notifyContributionOutcome(prev, next)
    }
  }

  // ─── Public-wall feature toggle ───────────────────────────────────────────
  if (hasCredit && prev.public_credit !== body.public_credit) {
    await updateCommunityContribution(id, { public_credit: body.public_credit })
    await logActivity("community", id, {
      type: "credit_changed",
      summary: body.public_credit ? "أُضيفت إلى حائط المجتمع" : "أُزيلت من حائط المجتمع",
      actor,
      metadata: { public_credit: body.public_credit },
    })
  }

  return NextResponse.json({ success: true })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authError = await requireAdminAPI("EDITOR")
  if (authError) return authError
  const { id } = await params
  if (!db) return NextResponse.json({ error: "خطأ في الخادم" }, { status: 500 })
  await db.delete(communityContributions).where(eq(communityContributions.id, id))
  await deleteCrmForSubject("community", id).catch(() => {})
  return NextResponse.json({ success: true })
}
