import { NextResponse } from "next/server"
import { getStudioSession, getTranscriptForSession, updateTranscriptProcessing } from "@/lib/studio"
import { processTranscript } from "@/lib/openai"
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
 * POST /api/admin/studio/[id]/transcript/process — trigger AI processing
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAdminAPI()
  if (authError) return authError
  const { id } = await params

  // AI guard: return cached result if already processed (unless force=true)
  let forceRegenerate = false
  try { const b = await request.clone().json(); forceRegenerate = b?.force === true } catch { /* no body is fine */ }
  if (!forceRegenerate) {
    const existingTranscript = await getTranscriptForSession(id)
    if (existingTranscript && existingTranscript.processing_status === "ready" && existingTranscript.transcript_article) {
      return NextResponse.json({
        transcript: existingTranscript,
        cached: true,
      })
    }
  }

  // Rate limit (with cleanup to prevent memory leak)
  cleanupRateLimit()
  const lastCall = recentCalls.get(id)
  if (lastCall && Date.now() - lastCall < RATE_LIMIT_MS) {
    const waitSec = Math.ceil((RATE_LIMIT_MS - (Date.now() - lastCall)) / 1000)
    return NextResponse.json(
      { error: `يرجى الانتظار ${waitSec} ثانية قبل إعادة المعالجة` },
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

  // Set processing status
  await updateTranscriptProcessing(transcript.id, {
    processing_status: "processing",
  })

  try {
    const result = await processTranscript(
      transcript.transcript_clean,
      session.video_title || ""
    )

    if (!result.success || !result.data) {
      await updateTranscriptProcessing(transcript.id, {
        processing_status: "error",
      })
      return NextResponse.json(
        { error: result.error || "فشل في معالجة النص" },
        { status: 500 }
      )
    }

    const saved = await updateTranscriptProcessing(transcript.id, {
      transcript_article: result.data.clean_article,
      summary: result.data.summary,
      quotes_extracted: result.data.quotes,
      processing_status: "ready",
    })

    if (!saved.success) {
      return NextResponse.json(
        { error: saved.error || "فشل في حفظ النتائج" },
        { status: 500 }
      )
    }

    return NextResponse.json({ transcript: saved.data })
  } catch (error) {
    console.error("Transcript processing error:", error)

    await updateTranscriptProcessing(transcript.id, {
      processing_status: "error",
    })

    return NextResponse.json(
      { error: "حدث خطأ أثناء معالجة النص" },
      { status: 500 }
    )
  }
}

/**
 * GET /api/admin/studio/[id]/transcript/process — get processing status + results
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAdminAPI()
  if (authError) return authError
  const { id } = await params
  const transcript = await getTranscriptForSession(id)

  if (!transcript) {
    return NextResponse.json({ transcript: null })
  }

  return NextResponse.json({
    processing_status: transcript.processing_status,
    transcript_article: transcript.transcript_article,
    summary: transcript.summary,
    quotes_extracted: transcript.quotes_extracted,
  })
}
