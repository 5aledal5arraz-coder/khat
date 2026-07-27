/**
 * ص-٥ — the bridge that was missing.
 *
 * `buildTimedSegmentsFromVtt` has existed, tested by ten cases, with ZERO
 * production callers: the caption file arrives carrying 19,667 word-level
 * timing tags, `cleanTranscriptText` erases every one of them with a
 * regex, and the generators were then asked to guess where each chapter
 * began. This module is the one place that reads the timings back out of
 * the stored `transcript_raw` before they are thrown away.
 *
 * It never throws. Absent or unusable cues simply mean "no proven
 * timings", and the caller falls back to the legacy estimate path — a
 * session transcribed by Whisper or pasted by hand has no cues to read
 * and must keep working exactly as before.
 */

import { buildTimedSegmentsFromVtt, type TimedSegment } from "./segments"
import { getTranscriptForSession } from "./transcripts"

/**
 * Real per-cue timings for a session, or null when the transcript has none.
 *
 * @param sessionId studio session id
 */
export async function getTimedSegmentsForSession(
  sessionId: string,
): Promise<TimedSegment[] | null> {
  const transcript = await getTranscriptForSession(sessionId)
  const raw = transcript?.transcript_raw
  if (!raw || typeof raw !== "string") return null
  return timedSegmentsFromRaw(raw, sessionId)
}

/** Pure half, so the parsing decision is testable without a database. */
export function timedSegmentsFromRaw(
  raw: string,
  label = "transcript",
): TimedSegment[] | null {
  // Cheap pre-check: no cue arrows means no timings, and calling the
  // builder would only produce its (correct) refusal-to-fabricate throw.
  if (!raw.includes("-->")) return null

  try {
    const segments = buildTimedSegmentsFromVtt(raw)
    return segments.length > 0 ? segments : null
  } catch (err) {
    // The builder throws rather than invent anchors — that is the point of
    // it. Log and fall back; never surface fabricated timings.
    console.warn(
      `[studio] no usable caption timings for ${label}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    )
    return null
  }
}
