/**
 * Enqueue a full-episode Studio transcription (`studio.transcribe`) — the only
 * way the request path starts one. Returns in milliseconds; Whisper runs in
 * the worker's heavy lane (lib/jobs/handlers/studio-transcribe.ts).
 *
 * Deduped per session (`studio_transcribe:<id>`): the whisper button, the
 * youtube-audio fallback and «توليد الكل» all attach to one in-flight run
 * instead of paying twice. max_attempts 1 — a transcription is paid per
 * minute of audio; a failure is shown with its reason, and retrying is the
 * operator's deliberate click.
 */

import { enqueueJobOnce, type EnqueueOnceResult } from "@/lib/jobs/queue"
import {
  STUDIO_TRANSCRIBE_JOB,
  studioTranscribeDedupeKey,
  type StudioTranscribeJobPayload,
} from "@/lib/jobs/studio-transcribe-jobs"

export async function enqueueStudioTranscription(
  payload: StudioTranscribeJobPayload,
): Promise<EnqueueOnceResult> {
  return enqueueJobOnce(STUDIO_TRANSCRIBE_JOB, payload, {
    dedupeKey: studioTranscribeDedupeKey(payload.sessionId),
    maxAttempts: 1,
    priority: 5,
  })
}
