import { NextResponse } from "next/server"
import { getStudioSession, revalidateStudio } from "@/lib/studio"
import { requireAdminAPI } from "@/lib/api-utils"
import {
  analyzeVideo,
  isVideoIntelligenceConfigured,
  summarizeForPrompt,
  type VideoAnalysis,
} from "@/lib/google-video-intelligence"

export const maxDuration = 300 // 5 minutes — video analysis can be slow

/**
 * POST /api/admin/studio/[id]/video-analysis
 *
 * Triggers Google Video Intelligence analysis for a YouTube video.
 * Returns shot changes, labels, and a prompt-ready summary.
 *
 * Body (optional): { gcsUri?: string }
 * If gcsUri is provided, it's used directly. Otherwise the session's
 * YouTube URL is used.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAdminAPI()
  if (authError) return authError
  const { id } = await params

  if (!isVideoIntelligenceConfigured()) {
    return NextResponse.json(
      { error: "GOOGLE_VIDEO_API_KEY غير مُعدّ في البيئة" },
      { status: 500 }
    )
  }

  const session = await getStudioSession(id)
  if (!session) {
    return NextResponse.json({ error: "الجلسة غير موجودة" }, { status: 404 })
  }

  // Determine the video URI
  let videoUri: string | null = null
  try {
    const body = await request.json().catch(() => ({}))
    if (body.gcsUri) {
      videoUri = body.gcsUri
    }
  } catch (err) {
    console.debug("[Studio:video-analysis] no request body (fine):", err)
  }

  if (!videoUri) {
    if (!session.youtube_url) {
      return NextResponse.json(
        { error: "لا يوجد رابط فيديو لهذه الجلسة — يمكنك تقديم gcsUri في الطلب" },
        { status: 400 }
      )
    }
    videoUri = session.youtube_url
  }

  try {
    const analysis: VideoAnalysis = await analyzeVideo(videoUri)

    const promptSummary = summarizeForPrompt(analysis)

    revalidateStudio(id)
    return NextResponse.json({
      analysis: {
        shotChangesCount: analysis.shotChanges.length,
        labelsCount: analysis.labels.length,
        durationSeconds: analysis.durationSeconds,
        shotChanges: analysis.shotChanges,
        labels: analysis.labels,
      },
      promptSummary,
    })
  } catch (error) {
    console.error("Video analysis error:", error)
    const msg = error instanceof Error ? error.message : "حدث خطأ أثناء تحليل الفيديو"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
