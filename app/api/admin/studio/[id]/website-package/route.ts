import { NextRequest, NextResponse } from "next/server"
import {
  getStudioSession, getTranscriptForSession,
  getWebsitePackageForSession, createWebsitePackage, updateWebsitePackage,
  revalidateStudio,
} from "@/lib/studio"
import { generateWebsitePackage } from "@/lib/ai"
import { requireAdminAPI } from "@/lib/api-utils"

export const maxDuration = 120

const recentCalls = new Map<string, number>()
const RATE_LIMIT_MS = 30_000
const RATE_LIMIT_MAX_ENTRIES = 500
function cleanupRateLimit() {
  if (recentCalls.size > RATE_LIMIT_MAX_ENTRIES) {
    const now = Date.now()
    for (const [key, time] of recentCalls) {
      if (now - time > RATE_LIMIT_MS) recentCalls.delete(key)
    }
  }
}

/**
 * GET /api/admin/studio/[id]/website-package — get existing package
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAdminAPI()
  if (authError) return authError
  const { id } = await params
  const pkg = await getWebsitePackageForSession(id)
  return NextResponse.json({ package: pkg || null })
}

/**
 * POST /api/admin/studio/[id]/website-package — generate website package from transcript
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAdminAPI()
  if (authError) return authError
  const { id } = await params

  // AI guard: return cached result if already generated (unless force=true)
  let forceRegenerate = false
  try { const b = await request.clone().json(); forceRegenerate = b?.force === true } catch (err) { console.debug("[Studio:website-package] no request body (fine):", err) }
  if (!forceRegenerate) {
    const existing = await getWebsitePackageForSession(id)
    if (existing && existing.status === "ready") {
      return NextResponse.json({ package: existing, cached: true })
    }
  }

  cleanupRateLimit()
  const lastCall = recentCalls.get(id)
  if (lastCall && Date.now() - lastCall < RATE_LIMIT_MS) {
    const waitSec = Math.ceil((RATE_LIMIT_MS - (Date.now() - lastCall)) / 1000)
    return NextResponse.json(
      { error: `يرجى الانتظار ${waitSec} ثانية قبل إعادة التوليد` },
      { status: 429 }
    )
  }

  const session = await getStudioSession(id)
  if (!session) {
    return NextResponse.json({ error: "الجلسة غير موجودة" }, { status: 404 })
  }

  const transcript = await getTranscriptForSession(id)
  if (!transcript || transcript.status !== "ready" || !transcript.transcript_clean) {
    return NextResponse.json(
      { error: "لا يوجد نص جاهز — اجلب النص التلقائي أولاً" },
      { status: 400 }
    )
  }

  recentCalls.set(id, Date.now())

  // Create placeholder
  await createWebsitePackage(id, {
    status: "generating",
    hero_summary: null,
    full_summary: null,
    takeaways: [],
    quotes: [],
    resources: [],
    timestamps: [],
    linked_episode_id: session.video_id || null,
    raw_openai_response: null,
    error_message: null,
  })

  try {
    const result = await generateWebsitePackage(
      transcript.transcript_clean,
      session.video_title || "",
      session.duration_seconds
    )

    if (!result.success || !result.data) {
      await createWebsitePackage(id, {
        status: "error",
        hero_summary: null,
        full_summary: null,
        takeaways: [],
        quotes: [],
            resources: [],
        timestamps: [],
        linked_episode_id: session.video_id || null,
        raw_openai_response: null,
        error_message: result.error || "فشل التوليد",
      })
      return NextResponse.json({ error: result.error || "فشل التوليد" }, { status: 500 })
    }

    const saved = await createWebsitePackage(id, {
      status: "ready",
      hero_summary: result.data.hero_summary,
      full_summary: result.data.full_summary,
      takeaways: result.data.takeaways,
      quotes: result.data.quotes,
      resources: result.data.resources,
      timestamps: result.data.timestamps,
      linked_episode_id: session.video_id || null,
      guest_package: result.data.guest_name ? {
        guest_name: result.data.guest_name,
        guest_bio: result.data.guest_bio || "",
        guest_photo_url: null,
        guest_external_links: {},
      } : null,
      raw_openai_response: {
        ...(result.raw || {}),
        guest_name: result.data.guest_name,
        guest_bio: result.data.guest_bio,
      },
      error_message: null,
    })

    if (!saved.success) {
      return NextResponse.json({ error: saved.error || "فشل في حفظ النتائج" }, { status: 500 })
    }

    revalidateStudio(id)
    return NextResponse.json({ package: saved.data })
  } catch (error) {
    console.error("Website package generate error:", error)
    await createWebsitePackage(id, {
      status: "error",
      hero_summary: null,
      full_summary: null,
      takeaways: [],
      quotes: [],
        resources: [],
      timestamps: [],
      linked_episode_id: session.video_id || null,
      raw_openai_response: null,
      error_message: error instanceof Error ? error.message : "خطأ غير متوقع",
    })
    return NextResponse.json({ error: "حدث خطأ أثناء التوليد" }, { status: 500 })
  }
}

/**
 * PATCH /api/admin/studio/[id]/website-package — save admin edits
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAdminAPI()
  if (authError) return authError
  const { id: sessionId } = await params

  const existing = await getWebsitePackageForSession(sessionId)
  if (!existing) {
    return NextResponse.json({ error: "لا توجد حزمة لهذه الجلسة" }, { status: 404 })
  }

  try {
    const body = await request.json()

    // Whitelist editable fields
    const allowed = ["hero_summary", "full_summary", "takeaways", "quotes", "resources", "timestamps", "custom_title", "selected_quote_indices", "selected_takeaway_indices", "linked_episode_id", "guest_package"] as const
    const updates: Record<string, unknown> = {}
    for (const key of allowed) {
      if (key in body) {
        updates[key] = body[key]
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "لا توجد حقول للتحديث" }, { status: 400 })
    }

    const result = await updateWebsitePackage(existing.id, updates as Parameters<typeof updateWebsitePackage>[1])
    if (!result.success) {
      return NextResponse.json({ error: result.error || "فشل الحفظ" }, { status: 500 })
    }

    revalidateStudio(sessionId)
    return NextResponse.json({ package: result.data })
  } catch (error) {
    console.error("Website package update error:", error)
    return NextResponse.json({ error: "حدث خطأ أثناء الحفظ" }, { status: 500 })
  }
}
