import { NextResponse } from "next/server"
import { getStudioSession, getTranscriptForSession, createAiOutput, getAiOutputForSession } from "@/lib/studio"
import { generateStudioPackage, STUDIO_PROMPT_VERSION } from "@/lib/openai"
import { requireAdminAPI } from "@/lib/api-utils"

export const maxDuration = 120

// Simple in-memory rate limiter: 1 generate call per session per 30 seconds
const recentCalls = new Map<string, number>()
const RATE_LIMIT_MS = 30_000
const RATE_LIMIT_MAX_ENTRIES = 500

// Periodic cleanup of stale entries to prevent memory leak
function cleanupRateLimit() {
  if (recentCalls.size <= RATE_LIMIT_MAX_ENTRIES) return
  const now = Date.now()
  for (const [key, ts] of recentCalls) {
    if (now - ts > RATE_LIMIT_MS) recentCalls.delete(key)
  }
}

/**
 * POST /api/admin/studio/[id]/generate — generate AI package from transcript
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
    const existing = await getAiOutputForSession(id)
    if (existing && existing.status === "ready") {
      return NextResponse.json({ output: existing, cached: true })
    }
  }

  // Rate limit check (with cleanup to prevent memory leak)
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

  // Mark rate limit
  recentCalls.set(id, Date.now())

  // Create a placeholder "generating" record so the UI can show progress
  const placeholder = await createAiOutput(id, {
    model: "gpt-4o-mini",
    prompt_version: STUDIO_PROMPT_VERSION,
    status: "generating",
    title_best: "",
    title_alternatives: [],
    thumbnail_text_options: [],
    youtube_description: "",
    seo_keywords: [],
    hashtags: [],
    raw_openai_response: null,
    error_message: null,
  })

  if (!placeholder.success) {
    return NextResponse.json(
      { error: placeholder.error || "فشل في إنشاء سجل التوليد" },
      { status: 500 }
    )
  }

  try {
    const result = await generateStudioPackage(
      transcript.transcript_clean,
      session.video_title || "",
      session.channel_title || ""
    )

    if (!result.success || !result.data) {
      // Save error state
      await createAiOutput(id, {
        model: "gpt-4o-mini",
        prompt_version: STUDIO_PROMPT_VERSION,
        status: "error",
        title_best: "",
        title_alternatives: [],
        thumbnail_text_options: [],
        youtube_description: "",
        seo_keywords: [],
        hashtags: [],
        raw_openai_response: null,
        error_message: result.error || "فشل التوليد",
      })

      return NextResponse.json(
        { error: result.error || "فشل التوليد" },
        { status: 500 }
      )
    }

    // Save the successful result
    const saved = await createAiOutput(id, {
      model: "gpt-4o-mini",
      prompt_version: STUDIO_PROMPT_VERSION,
      status: "ready",
      title_best: result.data.title_best,
      title_alternatives: result.data.title_alternatives,
      thumbnail_text_options: result.data.thumbnail_text_options,
      youtube_description: result.data.youtube_description,
      seo_keywords: result.data.seo_keywords,
      hashtags: result.data.hashtags,
      raw_openai_response: result.raw || null,
      error_message: null,
    })

    if (!saved.success) {
      return NextResponse.json(
        { error: saved.error || "فشل في حفظ النتائج" },
        { status: 500 }
      )
    }

    return NextResponse.json({ output: saved.data })
  } catch (error) {
    console.error("Studio generate error:", error)

    // Save error state
    await createAiOutput(id, {
      model: "gpt-4o-mini",
      prompt_version: STUDIO_PROMPT_VERSION,
      status: "error",
      title_best: "",
      title_alternatives: [],
      thumbnail_text_options: [],
      youtube_description: "",
      seo_keywords: [],
      hashtags: [],
      raw_openai_response: null,
      error_message: error instanceof Error ? error.message : "خطأ غير متوقع",
    })

    return NextResponse.json(
      { error: "حدث خطأ أثناء التوليد" },
      { status: 500 }
    )
  }
}

/**
 * GET /api/admin/studio/[id]/generate — get existing AI output for session
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAdminAPI()
  if (authError) return authError
  const { id } = await params
  const output = await getAiOutputForSession(id)

  return NextResponse.json({ output: output || null })
}
