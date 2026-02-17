import { NextRequest, NextResponse } from "next/server"
import { getMediaKitConfig, saveMediaKitConfig } from "@/lib/media-kit"
import type { MediaKitConfig } from "@/types/media-kit"
import { requireAdminAPI } from "@/lib/api-utils"

export async function GET() {
  const authError = await requireAdminAPI()
  if (authError) return authError
  const config = await getMediaKitConfig()
  return NextResponse.json(config)
}

export async function POST(request: NextRequest) {
  const authError = await requireAdminAPI()
  if (authError) return authError
  const config = (await request.json()) as MediaKitConfig
  await saveMediaKitConfig(config)
  return NextResponse.json({ success: true })
}
