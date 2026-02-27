import { NextResponse } from "next/server"
import { requireAdminAPI } from "@/lib/api-utils"
import { getNewsletterMetrics, getTopCampaigns } from "@/lib/newsletter/queries"

export async function GET() {
  const authError = await requireAdminAPI()
  if (authError) return authError

  const [metrics, topCampaigns] = await Promise.all([
    getNewsletterMetrics(),
    getTopCampaigns(5),
  ])

  if (!metrics) {
    return NextResponse.json({ error: "Database not configured" }, { status: 500 })
  }

  return NextResponse.json({ ...metrics, topCampaigns })
}
