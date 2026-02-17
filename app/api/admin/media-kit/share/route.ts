import { NextRequest, NextResponse } from "next/server"
import {
  getShareConfig,
  saveShareConfig,
  hashPassword,
  generateSlug,
} from "@/lib/media-kit-share"
import { requireAdminAPI } from "@/lib/api-utils"

export async function GET() {
  const authError = await requireAdminAPI()
  if (authError) return authError
  const config = await getShareConfig()
  if (!config) {
    return NextResponse.json({ enabled: false, slug: null, hasPassword: false })
  }
  return NextResponse.json({
    enabled: config.enabled,
    slug: config.slug,
    hasPassword: !!config.passwordHash,
  })
}

export async function POST(request: NextRequest) {
  const authError = await requireAdminAPI()
  if (authError) return authError
  const body = (await request.json()) as { enabled: boolean; password?: string }
  const existing = await getShareConfig()

  const now = new Date().toISOString()
  const slug = existing?.slug || generateSlug()
  const passwordHash = body.password
    ? await hashPassword(body.password)
    : existing?.passwordHash || ""

  await saveShareConfig({
    enabled: body.enabled,
    slug,
    passwordHash,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  })

  return NextResponse.json({
    enabled: body.enabled,
    slug,
    hasPassword: !!passwordHash,
  })
}
