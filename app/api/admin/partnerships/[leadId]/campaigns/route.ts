import { NextRequest, NextResponse } from "next/server"
import { requireAdminAPI, getAdminAuthUser } from "@/lib/api-utils"
import { stripHtml } from "@/lib/sanitize"
import { getCampaigns, createCampaign } from "@/lib/partnership-crm"
import type { PartnerCampaignStatus } from "@/types/database"

const STATUSES: PartnerCampaignStatus[] = ["planned", "live", "completed", "cancelled"]

export async function GET(_req: NextRequest, { params }: { params: Promise<{ leadId: string }> }) {
  const authError = await requireAdminAPI()
  if (authError) return authError
  const { leadId } = await params
  return NextResponse.json({ campaigns: await getCampaigns(leadId) })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ leadId: string }> }) {
  const authError = await requireAdminAPI()
  if (authError) return authError
  const { leadId } = await params
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const title = typeof body.title === "string" ? stripHtml(body.title).trim() : ""
  if (!title) return NextResponse.json({ error: "عنوان الحملة مطلوب" }, { status: 400 })
  const user = await getAdminAuthUser()
  const campaign = await createCampaign(leadId, {
    title,
    status: STATUSES.includes(body.status as PartnerCampaignStatus)
      ? (body.status as PartnerCampaignStatus)
      : "planned",
    start_date: typeof body.start_date === "string" && body.start_date ? body.start_date : null,
    end_date: typeof body.end_date === "string" && body.end_date ? body.end_date : null,
    deliverables: Array.isArray(body.deliverables)
      ? (body.deliverables as unknown[])
          .filter((d): d is string => typeof d === "string")
          .map((label) => ({ label: stripHtml(label), done: false }))
      : [],
    created_by: user ? `admin:${user.email}` : "admin",
  })
  return NextResponse.json({ campaign })
}
