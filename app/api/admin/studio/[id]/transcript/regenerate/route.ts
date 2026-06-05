import { NextResponse } from "next/server"
import { getStudioSession, getTranscriptForSession, updateTranscriptProcessing, revalidateStudio } from "@/lib/studio"
import { regenerateQuotes, regenerateKeyIdeas, regenerateLessons } from "@/lib/ai"
import { requireAdminAPI } from "@/lib/api-utils"

export const maxDuration = 120

type Section = "quotes" | "key_ideas" | "lessons"

const RATE_LIMIT_MAX_ENTRIES = 500

function cleanupRateLimit() {
  if (recentCalls.size > RATE_LIMIT_MAX_ENTRIES) {
    const now = Date.now()
    for (const [key, time] of recentCalls) {
      if (now - time > RATE_LIMIT_MS) recentCalls.delete(key)
    }
  }
}

const recentCalls = new Map<string, number>()
const RATE_LIMIT_MS = 15_000

/**
 * POST /api/admin/studio/[id]/transcript/regenerate
 * Body: { section: "quotes" | "key_ideas" | "lessons" }
 *
 * Regenerates a single section of the transcript processing output
 * without touching the other sections.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAdminAPI()
  if (authError) return authError
  cleanupRateLimit()
  const { id } = await params

  let section: Section
  try {
    const body = await request.json()
    section = body.section
  } catch {
    return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 })
  }

  if (!["quotes", "key_ideas", "lessons"].includes(section)) {
    return NextResponse.json(
      { error: "القسم المطلوب غير صالح — استخدم: quotes, key_ideas, lessons" },
      { status: 400 }
    )
  }

  // Rate limit per session+section
  const rateKey = `${id}:${section}`
  const lastCall = recentCalls.get(rateKey)
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

  recentCalls.set(rateKey, Date.now())
  const videoTitle = session.video_title || ""

  try {
    if (section === "quotes") {
      const result = await regenerateQuotes(transcript.transcript_clean, videoTitle)
      if (!result.success || !result.data) {
        return NextResponse.json({ error: result.error || "فشل في توليد الاقتباسات" }, { status: 500 })
      }
      const saved = await updateTranscriptProcessing(transcript.id, {
        quotes_extracted: result.data,
      })
      if (!saved.success) {
        return NextResponse.json({ error: saved.error || "فشل في الحفظ" }, { status: 500 })
      }
      revalidateStudio(id)
      return NextResponse.json({ section: "quotes", data: result.data })
    }

    if (section === "key_ideas") {
      const result = await regenerateKeyIdeas(transcript.transcript_clean, videoTitle)
      if (!result.success || !result.data) {
        return NextResponse.json({ error: result.error || "فشل في توليد الأفكار" }, { status: 500 })
      }
      const currentSummary = transcript.summary as { overview: string; key_ideas: string[]; lessons: string[] } | null
      const saved = await updateTranscriptProcessing(transcript.id, {
        summary: {
          overview: currentSummary?.overview || "",
          key_ideas: result.data,
          lessons: currentSummary?.lessons || [],
        },
      })
      if (!saved.success) {
        return NextResponse.json({ error: saved.error || "فشل في الحفظ" }, { status: 500 })
      }
      revalidateStudio(id)
      return NextResponse.json({ section: "key_ideas", data: result.data })
    }

    // section === "lessons"
    const result = await regenerateLessons(transcript.transcript_clean, videoTitle)
    if (!result.success || !result.data) {
      return NextResponse.json({ error: result.error || "فشل في توليد الدروس" }, { status: 500 })
    }
    const currentSummary = transcript.summary as { overview: string; key_ideas: string[]; lessons: string[] } | null
    const saved = await updateTranscriptProcessing(transcript.id, {
      summary: {
        overview: currentSummary?.overview || "",
        key_ideas: currentSummary?.key_ideas || [],
        lessons: result.data,
      },
    })
    if (!saved.success) {
      return NextResponse.json({ error: saved.error || "فشل في الحفظ" }, { status: 500 })
    }
    revalidateStudio(id)
    return NextResponse.json({ section: "lessons", data: result.data })
  } catch (error) {
    console.error("Regenerate section error:", error)
    return NextResponse.json(
      { error: "حدث خطأ أثناء إعادة التوليد" },
      { status: 500 }
    )
  }
}
