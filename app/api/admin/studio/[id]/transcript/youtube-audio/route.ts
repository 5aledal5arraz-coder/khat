import { NextResponse } from "next/server"
import path from "path"
import fs from "fs/promises"
import { getStudioSession, createTranscript, revalidateStudio } from "@/lib/studio"
import { transcribeAudioFile } from "@/lib/whisper"
import { downloadYouTubeAudio } from "@/lib/youtube/download"
import { requireAdminAPI } from "@/lib/api-utils"

export const maxDuration = 600 // 10 min — download + transcription can be slow

/**
 * POST /api/admin/studio/[id]/transcript/youtube-audio
 *
 * Downloads audio from YouTube via yt-dlp, transcribes it with OpenAI Whisper,
 * and saves the transcript. Used as a fallback when YouTube captions are unavailable.
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
      console.debug("[Studio:youtube-audio] no request body (fine):", err)
    }
  }

  if (!videoId) {
    return NextResponse.json(
      { error: "لا يوجد معرّف فيديو لهذه الجلسة" },
      { status: 400 }
    )
  }

  const tempDir = path.join(process.cwd(), "data", "studio-audio", id, "yt-temp")
  let cleanup: (() => Promise<void>) | null = null

  try {
    // Step 1: Download audio from YouTube
    const download = await downloadYouTubeAudio(videoId, tempDir)
    cleanup = download.cleanup

    // Step 2: Transcribe with Whisper
    const result = await transcribeAudioFile(download.filePath, "ar", {
      subjectTable: "studio_sessions",
      subjectId: id,
    })

    if (!result.success || !result.text) {
      return NextResponse.json(
        { error: result.error || "فشل في تحويل الصوت إلى نص" },
        { status: 500 }
      )
    }

    // Step 3: Save transcript
    const createResult = await createTranscript(id, "whisper", result.text, "ar")

    if (!createResult.success) {
      return NextResponse.json(
        { error: createResult.error || "فشل في حفظ النص" },
        { status: 500 }
      )
    }

    revalidateStudio(id)
    return NextResponse.json({ transcript: createResult.data })
  } catch (error) {
    const msg = error instanceof Error ? error.message : "فشل في تحويل صوت يوتيوب إلى نص"
    const stack = error instanceof Error ? error.stack : undefined
    console.error("[youtube-audio] Pipeline failed:", { videoId, error: msg, stack })
    return NextResponse.json({ error: msg }, { status: 500 })
  } finally {
    // Clean up temp audio file
    if (cleanup) {
      await cleanup()
    }
    // Also try to remove the temp directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true })
    } catch (err) {
      console.debug("[Studio:youtube-audio] temp dir cleanup failed:", err)
    }
  }
}
