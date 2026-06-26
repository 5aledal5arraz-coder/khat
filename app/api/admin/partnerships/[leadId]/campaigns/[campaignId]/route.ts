import { NextRequest, NextResponse } from "next/server"
import { requireAdminAPI, getAdminAuthUser } from "@/lib/api-utils"
import { stripHtml } from "@/lib/sanitize"
import { getCampaign, updateCampaign } from "@/lib/partnership-crm"
import { getSponsorshipLeadById } from "@/lib/admin/queries"
import { generateCampaignReport } from "@/lib/ai/sponsorship"
import { logActivity } from "@/lib/partnership-crm"
import type { PartnerCampaignStatus, PartnerCampaignDeliverable } from "@/types/database"

export const maxDuration = 60

const STATUSES: PartnerCampaignStatus[] = ["planned", "live", "completed", "cancelled"]

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ leadId: string; campaignId: string }> },
) {
  const authError = await requireAdminAPI()
  if (authError) return authError
  const { leadId, campaignId } = await params
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>

  // Sub-action: AI post-campaign performance report.
  if (body.action === "generate_report") {
    const lead = await getSponsorshipLeadById(leadId)
    const campaign = await getCampaign(leadId, campaignId)
    if (!lead || !campaign) return NextResponse.json({ error: "غير موجود" }, { status: 404 })
    const user = await getAdminAuthUser()
    const result = await generateCampaignReport(lead, campaign, {
      actorId: user ? `admin:${user.email}` : "admin",
    })
    if (!result.success) return NextResponse.json({ error: result.error }, { status: 500 })
    const updated = await updateCampaign(leadId, campaignId, {
      performance_summary: result.report,
      created_by: user ? `admin:${user.email}` : "admin",
    })
    await logActivity(leadId, {
      type: "report_generated",
      summary: `أُنشئ تقرير أداء للحملة: ${campaign.title}`,
      actor: "ai:director",
      metadata: { campaign_id: campaignId },
    })
    return NextResponse.json({ campaign: updated })
  }

  // Normal field update.
  const patch: Record<string, unknown> = {}
  if (typeof body.title === "string") patch.title = stripHtml(body.title)
  if (STATUSES.includes(body.status as PartnerCampaignStatus)) patch.status = body.status
  if (typeof body.roi_notes === "string") patch.roi_notes = stripHtml(body.roi_notes)
  if (body.metrics && typeof body.metrics === "object") {
    const m: Record<string, number> = {}
    for (const [k, v] of Object.entries(body.metrics as Record<string, unknown>)) {
      const n = Number(v)
      if (Number.isFinite(n)) m[stripHtml(k)] = n
    }
    patch.metrics = m
  }
  if (Array.isArray(body.deliverables)) {
    patch.deliverables = (body.deliverables as unknown[])
      .filter((d): d is Record<string, unknown> => !!d && typeof d === "object")
      .map((d) => ({ label: stripHtml(String(d.label ?? "")), done: Boolean(d.done) }))
      .filter((d: PartnerCampaignDeliverable) => d.label) as PartnerCampaignDeliverable[]
  }
  const user = await getAdminAuthUser()
  const campaign = await updateCampaign(leadId, campaignId, {
    ...patch,
    created_by: user ? `admin:${user.email}` : "admin",
  })
  if (!campaign) return NextResponse.json({ error: "الحملة غير موجودة" }, { status: 404 })
  return NextResponse.json({ campaign })
}
