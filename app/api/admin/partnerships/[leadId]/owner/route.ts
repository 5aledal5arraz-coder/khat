import { NextRequest, NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import { requireAdminAPI, getAdminAuthUser } from "@/lib/api-utils"
import { db } from "@/lib/db"
import { sponsorshipLeads } from "@/lib/db/schema/system"
import { logActivity } from "@/lib/partnership-crm"

// PATCH — assign / change the operator who owns this partner relationship.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ leadId: string }> }) {
  const authError = await requireAdminAPI()
  if (authError) return authError
  const { leadId } = await params
  if (!db) return NextResponse.json({ error: "خطأ في الخادم" }, { status: 500 })

  const body = (await req.json().catch(() => ({}))) as { owner?: string | null }
  const owner = typeof body.owner === "string" && body.owner.trim() ? body.owner.trim() : null

  await db.update(sponsorshipLeads).set({ owner }).where(eq(sponsorshipLeads.id, leadId))

  const user = await getAdminAuthUser()
  await logActivity(leadId, {
    type: "owner_changed",
    summary: owner ? `أُسند المالك إلى ${owner}` : "أُزيل المالك",
    actor: user ? `admin:${user.email}` : "admin",
    metadata: { owner },
  })
  return NextResponse.json({ success: true, owner })
}
