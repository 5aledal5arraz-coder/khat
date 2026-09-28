/**
 * `studio.transcribe` — full-episode Whisper transcription in the worker.
 *
 * Mirrors what the two transcript routes and generate-stream's transcript step
 * used to do inline (see lib/jobs/studio-transcribe-jobs.ts):
 *   • cached-transcript short-circuit unless `force` (re-transcribing is paid);
 *   • audio: the uploaded file (resolveSessionAudioPath — never audio_filename);
 *   • youtube: yt-dlp audio into a temp dir, always cleaned up.
 * `transcribeAudioFile` never throws — it returns `{ success:false, error }`.
 * The handler THROWS that error so the worker's quota detection can see
 * "no credits remaining" / "insufficient_quota" and dead-letter on attempt 1
 * with the billing message; any other failure is recorded on the transcript
 * row (createTranscriptError, as the whisper route did) and fails the job.
 * Progress: «المقطع n/N» per chunk, which also renews the lease.
 *
 * No revalidatePath here — there is no Next request context in the worker; the
 * Studio re-reads the transcript when its status card settles.
 */

import path from "path"
import fs from "fs/promises"
import { registerHandler } from "../registry"
import { NonRetryableJobError } from "../types"
import {
  STUDIO_TRANSCRIBE_JOB,
  type StudioTranscribeJobPayload,
  type StudioTranscribeJobResult,
} from "../studio-transcribe-jobs"
import {
  getStudioSession,
  getTranscriptForSession,
  createTranscript,
  createTranscriptError,
} from "@/lib/studio"
import { resolveSessionAudioPath } from "@/lib/studio/audio-path"
import { transcribeAudioFile } from "@/lib/whisper"
import { downloadYouTubeAudio } from "@/lib/youtube/download"

export async function runStudioTranscribe(
  payload: StudioTranscribeJobPayload,
  reportProgress: (p: Record<string, unknown>) => Promise<void>,
): Promise<StudioTranscribeJobResult> {
  const id = payload?.sessionId
  if (!id) throw new NonRetryableJobError("مهمة التفريغ بلا معرّف جلسة.")

  if (!payload.force) {
    const existing = await getTranscriptForSession(id)
    if (existing?.status === "ready" && existing.transcript_clean?.trim()) {
      return { ok: true, cached: true, chars: existing.transcript_clean.length }
    }
  }

  const session = await getStudioSession(id)
  if (!session) throw new NonRetryableJobError("الجلسة غير موجودة.")

  const onProgress = ({ currentChunk, totalChunks }: { currentChunk: number; totalChunks: number }) => {
    void reportProgress({
      stage: "transcribing",
      label: "تحويل الصوت إلى نص",
      currentChunk,
      totalChunks,
      fraction: totalChunks > 0 ? currentChunk / totalChunks : null,
    })
  }
  const ctx = { subjectTable: "studio_sessions", subjectId: id }

  let text: string
  if (payload.source === "audio") {
    if (!session.audio_filename) {
      throw new NonRetryableJobError("لم يتم العثور على ملف صوتي لهذه الجلسة.")
    }
    let filePath: string
    try {
      filePath = await resolveSessionAudioPath(id, session.audio_filename)
    } catch {
      throw new NonRetryableJobError("الملف الصوتي غير موجود على الخادم.")
    }
    await reportProgress({ stage: "transcribing", label: "تجهيز الملف الصوتي" })
    const result = await transcribeAudioFile(filePath, "ar", ctx, onProgress)
    if (!result.success || !result.text) {
      const msg = result.error || "فشل في تحويل الصوت إلى نص"
      await createTranscriptError(id, msg).catch(() => {})
      throw new Error(msg)
    }
    text = result.text
  } else {
    const videoId = session.video_id ?? payload.videoId ?? null
    if (!videoId) throw new NonRetryableJobError("لا يوجد معرّف فيديو لهذه الجلسة.")
    const tempDir = path.join(process.cwd(), "data", "studio-audio", id, "yt-temp")
    let cleanup: (() => Promise<void>) | null = null
    try {
      await reportProgress({ stage: "downloading", label: "تحميل الصوت من يوتيوب" })
      const download = await downloadYouTubeAudio(videoId, tempDir)
      cleanup = download.cleanup
      const result = await transcribeAudioFile(download.filePath, "ar", ctx, onProgress)
      if (!result.success || !result.text) {
        throw new Error(result.error || "فشل في تحويل الصوت إلى نص")
      }
      text = result.text
    } finally {
      if (cleanup) await cleanup().catch(() => {})
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {})
    }
  }

  await reportProgress({ stage: "saving", label: "حفظ النص" })
  const saved = await createTranscript(id, "whisper", text, "ar")
  if (!saved.success) throw new Error(saved.error || "فشل في حفظ النص")
  return { ok: true, cached: false, chars: text.length }
}

registerHandler<StudioTranscribeJobPayload, StudioTranscribeJobResult>(
  STUDIO_TRANSCRIBE_JOB,
  (payload, ctx) => runStudioTranscribe(payload, ctx.reportProgress),
)
