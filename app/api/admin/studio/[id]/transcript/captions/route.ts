import { NextResponse } from "next/server"
import { getStudioSession, createTranscript, revalidateStudio } from "@/lib/studio"
import { fetchTranscriptServer } from "@/lib/youtube/transcript-server"
import { requireAdminAPI } from "@/lib/api-utils"

export const maxDuration = 120 // 2 min — yt-dlp subtitle download

/**
 * POST /api/admin/studio/[id]/transcript/captions
 *
 * Extracts YouTube captions server-side via yt-dlp (fetchTranscriptServer) and
 * saves them as the session transcript. createTranscript() cleans the raw VTT
 * (WEBVTT header + timestamps) automatically. Returns 422 when no captions are
 * available so the client falls back to the audio → Whisper route.
 *
 * Replaces the old browser-side proxy extraction (transcript-client.ts).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAdminAPI()
  if (authError) return authError
  const { id } = await params
  const session = await getStudioSession(id)

  // Accept video_id from body as fallback (mock mode may not share in-memory sessions)
  let videoId = session?.video_id
  if (!videoId) {
    try {
      const body = await request.json()
      videoId = body.video_id || null
    } catch (err) {
      console.debug("[Studio:captions] no request body (fine):", err)
    }
  }

  if (!videoId) {
    return NextResponse.json(
      { error: "لا يوجد معرّف فيديو لهذه الجلسة" },
      { status: 400 }
    )
  }

  const result = await fetchTranscriptServer(videoId)
  if (!result.success || !result.text) {
    // No captions — 422 signals the client to fall back to audio → Whisper.
    return NextResponse.json(
      { error: result.error || "لا تتوفر ترجمة تلقائية لهذا الفيديو" },
      { status: 422 }
    )
  }

  const createResult = await createTranscript(id, "youtube_captions", result.text, result.language || "ar")
  if (!createResult.success) {
    return NextResponse.json(
      { error: createResult.error || "فشل في حفظ النص" },
      { status: 500 }
    )
  }

  revalidateStudio(id)
  return NextResponse.json({ transcript: createResult.data })
}
