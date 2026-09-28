/**
 * Studio full-text transcription — shared job contract.
 *
 * Whisper (gpt-4o-transcribe) over a whole episode is minutes of chunked,
 * paid work ($1.30 for the 216-minute reference). It used to run inside three
 * request handlers — `transcript/whisper`, `transcript/youtube-audio` and the
 * transcript step of `generate-stream` — with maxDuration 600 behind nginx's
 * 120s cut: the browser lost the connection while the server kept paying, and
 * a retry paid again. It now runs in the worker as `studio.transcribe`
 * (heavy lane), deduped per session; the routes answer 202 + jobId.
 *
 * SIDE-EFFECT-FREE — routes import the constants without the whisper module.
 */

export const STUDIO_TRANSCRIBE_JOB = "studio.transcribe"

export function studioTranscribeDedupeKey(sessionId: string): string {
  return `studio_transcribe:${sessionId}`
}

export interface StudioTranscribeJobPayload extends Record<string, unknown> {
  sessionId: string
  /** "audio" = the uploaded file; "youtube" = yt-dlp download of the video's audio. */
  source: "audio" | "youtube"
  /** youtube only — body fallback when the session row has no video_id. */
  videoId?: string | null
  /** Re-transcribe even when a ready transcript exists (a deliberate, paid act). */
  force: boolean
}

export interface StudioTranscribeJobResult extends Record<string, unknown> {
  ok: boolean
  /** A ready transcript already existed and force was off — nothing was paid for. */
  cached: boolean
  chars: number
  messageAr?: string
}
