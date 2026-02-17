import { NextRequest, NextResponse } from "next/server"
import {
  getStudioSession, getTranscriptForSession,
  getChaptersForSession, createChapters, updateChapters,
} from "@/lib/studio"
import { generateStudioChapters, STUDIO_PROMPT_VERSION } from "@/lib/openai"
import { requireAdminAPI } from "@/lib/api-utils"

export const maxDuration = 120

const recentCalls = new Map<string, number>()
const RATE_LIMIT_MS = 30_000
const RATE_LIMIT_MAX_ENTRIES = 500

function cleanupRateLimit() {
  if (recentCalls.size <= RATE_LIMIT_MAX_ENTRIES) return
  const now = Date.now()
  for (const [key, ts] of recentCalls) {
    if (now - ts > RATE_LIMIT_MS) recentCalls.delete(key)
  }
}

/**
 * GET /api/admin/studio/[id]/chapters — get existing chapters
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAdminAPI()
  if (authError) return authError
  const { id } = await params
  const chapters = await getChaptersForSession(id)
  return NextResponse.json({ chapters: chapters || null })
}

/**
 * POST /api/admin/studio/[id]/chapters — generate chapters from transcript
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
  try { const b = await request.clone().json(); forceRegenerate = b?.force === true } catch { /* no body is fine */ }
  if (!forceRegenerate) {
    const existing = await getChaptersForSession(id)
    if (existing && existing.status === "ready") {
      return NextResponse.json({ chapters: existing, cached: true })
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

  // Placeholder record
  await createChapters(id, {
    status: "generating",
    chapters: [],
    raw_openai_response: null,
    error_message: null,
  })

  try {
    const result = await generateStudioChapters(
      transcript.transcript_clean,
      session.video_title || "",
      session.duration_seconds
    )

    if (!result.success || !result.data) {
      await createChapters(id, {
        status: "error",
        chapters: [],
        raw_openai_response: null,
        error_message: result.error || "فشل التوليد",
      })
      return NextResponse.json({ error: result.error || "فشل التوليد" }, { status: 500 })
    }

    const saved = await createChapters(id, {
      status: "ready",
      chapters: result.data.chapters,
      raw_openai_response: result.raw || null,
      error_message: null,
    })

    if (!saved.success) {
      return NextResponse.json({ error: saved.error || "فشل في حفظ النتائج" }, { status: 500 })
    }

    return NextResponse.json({ chapters: saved.data })
  } catch (error) {
    console.error("Chapters generate error:", error)
    await createChapters(id, {
      status: "error",
      chapters: [],
      raw_openai_response: null,
      error_message: error instanceof Error ? error.message : "خطأ غير متوقع",
    })
    return NextResponse.json({ error: "حدث خطأ أثناء التوليد" }, { status: 500 })
  }
}

/**
 * PATCH /api/admin/studio/[id]/chapters — save admin edits to chapters
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAdminAPI()
  if (authError) return authError
  const { id: sessionId } = await params

  const existing = await getChaptersForSession(sessionId)
  if (!existing) {
    return NextResponse.json({ error: "لا توجد فصول لهذه الجلسة" }, { status: 404 })
  }

  try {
    const body = await request.json()
    if (!Array.isArray(body.chapters)) {
      return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 })
    }

    const result = await updateChapters(existing.id, { chapters: body.chapters })
    if (!result.success) {
      return NextResponse.json({ error: result.error || "فشل الحفظ" }, { status: 500 })
    }

    return NextResponse.json({ chapters: result.data })
  } catch (error) {
    console.error("Chapters update error:", error)
    return NextResponse.json({ error: "حدث خطأ أثناء الحفظ" }, { status: 500 })
  }
}
