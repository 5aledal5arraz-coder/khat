import { NextRequest, NextResponse } from "next/server"
import { getShareConfig, saveShareConfig, verifyPassword, hashPassword } from "@/lib/media-kit/share"
import { getMediaKitConfig } from "@/lib/media-kit/config"
import { getAnalyticsConfig } from "@/lib/admin/analytics"
import { checkIpRateLimit } from "@/lib/rate-limit"

const MAX_ATTEMPTS = 5
const WINDOW_MS = 15 * 60 * 1000 // 15 minutes

export async function POST(request: NextRequest) {
  // Rate limit: 5 attempts per IP per 15 minutes
  const rateLimit = checkIpRateLimit(request, "media_kit_verify", MAX_ATTEMPTS, WINDOW_MS)
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "تم تجاوز عدد المحاولات المسموح. حاول مرة أخرى بعد قليل." },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil((rateLimit.resetAt.getTime() - Date.now()) / 1000)),
        },
      }
    )
  }

  let body: { slug: string; password: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 })
  }

  const config = await getShareConfig()

  if (!config || !config.enabled || config.slug !== body.slug) {
    return NextResponse.json(
      { error: "هذا الرابط غير متاح" },
      { status: 404 }
    )
  }

  const result = await verifyPassword(body.password, config.passwordHash)

  if (!result.valid) {
    return NextResponse.json(
      { error: "كلمة المرور غير صحيحة" },
      { status: 401 }
    )
  }

  // Auto-upgrade legacy SHA-256 hash to bcrypt on successful login
  if (result.needsRehash) {
    const newHash = await hashPassword(body.password)
    await saveShareConfig({ ...config, passwordHash: newHash, updatedAt: new Date().toISOString() })
  }

  const [mediaKit, analytics] = await Promise.all([
    getMediaKitConfig(),
    getAnalyticsConfig(),
  ])

  return NextResponse.json({ mediaKit, analytics })
}
