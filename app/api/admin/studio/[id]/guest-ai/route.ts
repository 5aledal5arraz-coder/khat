import { NextResponse } from "next/server"
import { getStudioSession, getTranscriptForSession, getWebsitePackageForSession, createWebsitePackage, updateWebsitePackage } from "@/lib/studio"
import { generateGuestFromTranscript } from "@/lib/openai"
import { requireAdminAPI } from "@/lib/api-utils"

const recentCalls = new Map<string, number>()
const RATE_LIMIT_MS = 10_000

/**
 * POST /api/admin/studio/[id]/guest-ai — AI-generate guest name + bio only
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAdminAPI()
  if (authError) return authError
  const { id } = await params

  // Rate limit
  const lastCall = recentCalls.get(id)
  if (lastCall && Date.now() - lastCall < RATE_LIMIT_MS) {
    const waitSec = Math.ceil((RATE_LIMIT_MS - (Date.now() - lastCall)) / 1000)
    return NextResponse.json(
      { error: `يرجى الانتظار ${waitSec} ثانية` },
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

  try {
    const result = await generateGuestFromTranscript(
      transcript.transcript_clean,
      session.video_title || ""
    )

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 })
    }

    const guestPackage = result.data.guest_name
      ? {
          guest_name: result.data.guest_name,
          guest_bio: result.data.guest_bio || "",
          guest_photo_url: null as string | null,
          guest_external_links: {} as Record<string, string>,
        }
      : null

    // Save to website package (create if needed, update if exists)
    const existing = await getWebsitePackageForSession(id)
    if (existing) {
      await updateWebsitePackage(existing.id, { guest_package: guestPackage })
    } else {
      await createWebsitePackage(id, {
        status: "ready",
        hero_summary: null,
        full_summary: null,
        takeaways: [],
        quotes: [],
        topics: [],
        resources: [],
        timestamps: [],
        linked_episode_id: session.video_id || null,
        guest_package: guestPackage,
        raw_openai_response: null,
        error_message: null,
      })
    }

    return NextResponse.json({ guest_package: guestPackage })
  } catch (error) {
    console.error("Guest AI generation error:", error)
    return NextResponse.json({ error: "حدث خطأ أثناء استخراج بيانات الضيف" }, { status: 500 })
  }
}
