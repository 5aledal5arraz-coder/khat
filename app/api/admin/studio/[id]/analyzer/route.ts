import { NextResponse } from "next/server"
import { getStudioSession, getTranscriptForSession, createAnalyzer, getAnalyzerForSession, revalidateStudio } from "@/lib/studio"
import { generateStudioAnalysis, ANALYZER_PROMPT_VERSION, type YouTubeVideoStats } from "@/lib/ai"
import { requireAdminAPI } from "@/lib/api-utils"

export const maxDuration = 120

// Simple in-memory rate limiter: 1 analyze call per session per 30 seconds
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
 * POST /api/admin/studio/[id]/analyzer — generate performance analysis
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
  try { const b = await request.clone().json(); forceRegenerate = b?.force === true } catch (err) { console.debug("[Studio:analyzer] no request body (fine):", err) }
  if (!forceRegenerate) {
    const existing = await getAnalyzerForSession(id)
    if (existing && existing.status === "ready") {
      return NextResponse.json({ analyzer: existing, cached: true })
    }
  }

  // Rate limit check (with cleanup to prevent memory leak)
  cleanupRateLimit()
  const lastCall = recentCalls.get(id)
  if (lastCall && Date.now() - lastCall < RATE_LIMIT_MS) {
    const waitSec = Math.ceil((RATE_LIMIT_MS - (Date.now() - lastCall)) / 1000)
    return NextResponse.json(
      { error: `يرجى الانتظار ${waitSec} ثانية قبل إعادة التحليل` },
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

  // Extract YouTube stats from raw_youtube_response
  const raw = session.raw_youtube_response as Record<string, unknown> | null
  const snippet = (raw?.snippet ?? {}) as Record<string, unknown>
  const statistics = (raw?.statistics ?? {}) as Record<string, string>
  const contentDetails = (raw?.contentDetails ?? {}) as Record<string, string>

  const stats: YouTubeVideoStats = {
    title: (snippet.title as string) || session.video_title || "",
    description: (snippet.description as string) || "",
    publishDate: (snippet.publishedAt as string) || session.published_at || "",
    duration: contentDetails.duration || "",
    viewCount: statistics.viewCount || "0",
    likeCount: statistics.likeCount || "0",
    commentCount: statistics.commentCount || "0",
  }

  // Mark rate limit
  recentCalls.set(id, Date.now())

  // Create a placeholder "generating" record
  const placeholder = await createAnalyzer(id, {
    status: "generating",
    data: null,
    prompt_version: ANALYZER_PROMPT_VERSION,
    raw_openai_response: null,
    error_message: null,
  })

  if (!placeholder.success) {
    return NextResponse.json(
      { error: placeholder.error || "فشل في إنشاء سجل التحليل" },
      { status: 500 }
    )
  }

  try {
    const result = await generateStudioAnalysis(
      transcript.transcript_clean,
      stats
    )

    if (!result.success || !result.data) {
      await createAnalyzer(id, {
        status: "error",
        data: null,
        prompt_version: ANALYZER_PROMPT_VERSION,
        raw_openai_response: null,
        error_message: result.error || "فشل التحليل",
      })

      return NextResponse.json(
        { error: result.error || "فشل التحليل" },
        { status: 500 }
      )
    }

    const saved = await createAnalyzer(id, {
      status: "ready",
      data: result.data,
      prompt_version: ANALYZER_PROMPT_VERSION,
      raw_openai_response: result.raw || null,
      error_message: null,
    })

    if (!saved.success) {
      return NextResponse.json(
        { error: saved.error || "فشل في حفظ النتائج" },
        { status: 500 }
      )
    }

    revalidateStudio(id)
    return NextResponse.json({ analyzer: saved.data })
  } catch (error) {
    console.error("Studio analyzer error:", error)

    await createAnalyzer(id, {
      status: "error",
      data: null,
      prompt_version: ANALYZER_PROMPT_VERSION,
      raw_openai_response: null,
      error_message: error instanceof Error ? error.message : "خطأ غير متوقع",
    })

    return NextResponse.json(
      { error: "حدث خطأ أثناء التحليل" },
      { status: 500 }
    )
  }
}

/**
 * GET /api/admin/studio/[id]/analyzer — get existing analysis for session
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAdminAPI()
  if (authError) return authError
  const { id } = await params
  const analyzer = await getAnalyzerForSession(id)

  return NextResponse.json({ analyzer: analyzer || null })
}
