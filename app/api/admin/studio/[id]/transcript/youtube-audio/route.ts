import { NextResponse } from "next/server"
import { getStudioSession, getTranscriptForSession } from "@/lib/studio"
import { enqueueStudioTranscription } from "@/lib/studio/transcribe-enqueue"
import { requireAdminAPI } from "@/lib/api-utils"

/**
 * POST /api/admin/studio/[id]/transcript/youtube-audio
 *
 * Fallback when YouTube captions are unavailable: download the video's audio
 * via yt-dlp and transcribe it with Whisper. Both now run in the worker
 * (`studio.transcribe`, source "youtube"); this answers 202 `{ jobId }` in
 * milliseconds instead of holding the request for the whole download +
 * transcription (maxDuration 600, cut by nginx at 120s).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAdminAPI()
  if (authError) return authError
  const { id } = await params

  // ص-٨ — download + Whisper is the second-most expensive path in the Studio;
  // a ready transcript short-circuits unless `force`.
  let body: { force?: unknown; video_id?: unknown } = {}
  try { body = (await request.json()) ?? {} } catch (err) { console.debug("[Studio:youtube-audio] no request body (fine):", err) }
  const forceRegenerate = body.force === true
  if (!forceRegenerate) {
    const existing = await getTranscriptForSession(id)
    if (existing?.status === "ready" && existing.transcript_clean?.trim()) {
      return NextResponse.json({ transcript: existing, cached: true })
    }
  }

  const session = await getStudioSession(id)
  // Accept video_id from body as fallback (mock mode may not share in-memory sessions)
  const videoId =
    session?.video_id ?? (typeof body.video_id === "string" && body.video_id ? body.video_id : null)
  if (!videoId) {
    return NextResponse.json({ error: "لا يوجد معرّف فيديو لهذه الجلسة" }, { status: 400 })
  }

  try {
    const q = await enqueueStudioTranscription({
      sessionId: id,
      source: "youtube",
      videoId,
      force: forceRegenerate,
    })
    return NextResponse.json(
      { jobId: q.job.id, status: q.job.status, alreadyRunning: q.alreadyRunning },
      { status: q.alreadyRunning ? 200 : 202 },
    )
  } catch (error) {
    console.error("[Studio:youtube-audio] enqueue failed:", error)
    return NextResponse.json({ error: "تعذّر جدولة تحويل صوت يوتيوب إلى نص" }, { status: 500 })
  }
}
