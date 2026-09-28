import { NextResponse } from "next/server"
import { getStudioSession, getTranscriptForSession } from "@/lib/studio"
import { resolveSessionAudioPath } from "@/lib/studio/audio-path"
import { enqueueStudioTranscription } from "@/lib/studio/transcribe-enqueue"
import { requireAdminAPI } from "@/lib/api-utils"

/**
 * POST /api/admin/studio/[id]/transcript/whisper — transcribe the uploaded
 * audio via Whisper.
 *
 * Returns 202 `{ jobId, alreadyRunning }` in milliseconds: the transcription
 * runs in the worker as `studio.transcribe` (it used to run right here, with
 * maxDuration 600, behind nginx's 120s cut). Poll GET /api/admin/jobs/status.
 * The cheap preconditions (session, source, file on disk) still answer
 * synchronously so a doomed job is never queued.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAdminAPI()
  if (authError) return authError
  const { id } = await params

  // ص-٨ — Whisper is the single most expensive call in the Studio
  // ($1.2954 for the 216-minute reference episode). Re-transcribing must be a
  // deliberate act: a ready transcript short-circuits unless `force`.
  let forceRegenerate = false
  try { const b = await request.clone().json(); forceRegenerate = b?.force === true } catch (err) { console.debug("[Studio:whisper] no request body (fine):", err) }
  if (!forceRegenerate) {
    const existing = await getTranscriptForSession(id)
    if (existing?.status === "ready" && existing.transcript_clean?.trim()) {
      return NextResponse.json({ transcript: existing, cached: true })
    }
  }

  const session = await getStudioSession(id)
  if (!session) {
    return NextResponse.json({ error: "الجلسة غير موجودة" }, { status: 404 })
  }
  if (session.source !== "audio") {
    return NextResponse.json({ error: "هذه الجلسة ليست جلسة صوتية" }, { status: 400 })
  }
  if (!session.audio_filename) {
    return NextResponse.json({ error: "لم يتم العثور على ملف صوتي لهذه الجلسة" }, { status: 400 })
  }
  // The uploader stores the file as audio-{id}{ext}, NOT under the original
  // browser filename — resolve (and so confirm) the on-disk path up front.
  try {
    await resolveSessionAudioPath(id, session.audio_filename)
  } catch {
    return NextResponse.json({ error: "الملف الصوتي غير موجود على الخادم" }, { status: 404 })
  }

  try {
    const q = await enqueueStudioTranscription({ sessionId: id, source: "audio", force: forceRegenerate })
    return NextResponse.json(
      { jobId: q.job.id, status: q.job.status, alreadyRunning: q.alreadyRunning },
      { status: q.alreadyRunning ? 200 : 202 },
    )
  } catch (error) {
    console.error("[Studio:whisper] enqueue failed:", error)
    return NextResponse.json({ error: "تعذّر جدولة تحويل الصوت إلى نص" }, { status: 500 })
  }
}
