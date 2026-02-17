import { NextRequest, NextResponse } from "next/server"
import { getAnalyticsConfig, saveAnalyticsConfig } from "@/lib/admin/analytics"
import type { AnalyticsConfig } from "@/types/media-kit"
import { requireAdminAPI } from "@/lib/api-utils"

export async function GET() {
  const authError = await requireAdminAPI()
  if (authError) return authError
  const config = await getAnalyticsConfig()
  return NextResponse.json(config)
}

export async function POST(request: NextRequest) {
  const authError = await requireAdminAPI()
  if (authError) return authError
  const config = (await request.json()) as AnalyticsConfig
  await saveAnalyticsConfig(config)
  return NextResponse.json({ success: true })
}
