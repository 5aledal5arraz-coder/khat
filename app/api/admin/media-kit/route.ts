import { NextRequest, NextResponse } from "next/server"
import { getMediaKitConfig, saveMediaKitConfig } from "@/lib/media-kit"
import type { MediaKitConfig } from "@/types/ads"

export async function GET() {
  const config = await getMediaKitConfig()
  return NextResponse.json(config)
}

export async function POST(request: NextRequest) {
  const config = (await request.json()) as MediaKitConfig
  await saveMediaKitConfig(config)
  return NextResponse.json({ success: true })
}
