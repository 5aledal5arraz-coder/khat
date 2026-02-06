import { NextRequest, NextResponse } from "next/server"
import { getAnalyticsConfig, saveAnalyticsConfig } from "@/lib/admin/analytics"
import type { AnalyticsConfig } from "@/types/ads"

export async function GET() {
  const config = await getAnalyticsConfig()
  return NextResponse.json(config)
}

export async function POST(request: NextRequest) {
  const config = (await request.json()) as AnalyticsConfig
  await saveAnalyticsConfig(config)
  return NextResponse.json({ success: true })
}
