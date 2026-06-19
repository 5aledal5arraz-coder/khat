import { NextResponse } from "next/server"
import { requireRole } from "@/lib/api-utils"
import { getNewsletterMetrics, getTopCampaigns } from "@/lib/newsletter/queries"

export async function GET() {
  const auth = await requireRole("VIEWER")
  if (auth.error) return auth.error

  const [metrics, topCampaigns] = await Promise.all([
    getNewsletterMetrics(),
    getTopCampaigns(5),
  ])

  if (!metrics) {
    return NextResponse.json({ error: "Database not configured" }, { status: 500 })
  }

  return NextResponse.json({ ...metrics, topCampaigns })
}
