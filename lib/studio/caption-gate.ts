/**
 * ص-٦ — is this caption track good enough to use instead of paying for
 * Whisper?
 *
 * The decision used to rest on one test: "are the captions longer than ten
 * characters?". A broken file with a single sentence beat a full
 * transcription. And the live run showed the choice matters in the
 * opposite direction from what we assumed: measured against 36 proper
 * nouns, captions won 11 and Whisper won 3 (22 ties). Whisper's only real
 * gain was punctuation and hamza placement — cosmetic, for $1.2954 an
 * episode — while it DISCARDED the word-level timings that ص-٥ needs,
 * because `gpt-4o-transcribe` refuses to return them.
 *
 * So captions are now the default and this gate exists to catch the case
 * the old test was pretending to check: a track too thin to be a real
 * transcript of an episode that long.
 */

import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { episodes } from "@/lib/db/schema/episodes"
import { fetchTranscriptServer } from "@/lib/youtube/transcript-server"
import { cleanTranscriptText } from "./utils"

/** Below this many characters nothing is a usable episode transcript. */
export const MIN_CAPTION_CHARS = 500

/**
 * Measured on this corpus: 565 clean chars per minute of Arabic speech
 * (4,742 chars over 8.4 minutes). A track carrying less than a quarter of
 * that is missing most of the episode — truncated, partial, or a
 * placeholder track for a different cut.
 */
export const MEASURED_CHARS_PER_MINUTE = 565
export const MIN_DENSITY_RATIO = 0.25

export interface CaptionQualityVerdict {
  usable: boolean
  /** Machine-readable reason, for logs and telemetry. */
  reason:
    | "ok"
    | "empty"
    | "too_short"
    | "too_sparse_for_duration"
  /** Arabic, operator-facing. */
  message?: string
  charsPerMinute: number | null
}

/**
 * @param cleanText  the CLEANED caption text (post `cleanTranscriptText`)
 * @param durationSeconds episode duration, when known
 */
export function assessCaptionQuality(
  cleanText: string | null | undefined,
  durationSeconds: number | null,
): CaptionQualityVerdict {
  const text = (cleanText ?? "").trim()

  if (text.length === 0) {
    return {
      usable: false,
      reason: "empty",
      message: "ملف الترجمة فارغ",
      charsPerMinute: null,
    }
  }

  if (text.length < MIN_CAPTION_CHARS) {
    return {
      usable: false,
      reason: "too_short",
      message: `الترجمة قصيرة جداً (${text.length} حرف) — لا تصلح كنص حلقة`,
      charsPerMinute: null,
    }
  }

  // No duration to compare against: length alone already passed, and
  // guessing a density would be inventing a threshold.
  if (!durationSeconds || durationSeconds <= 0) {
    return { usable: true, reason: "ok", charsPerMinute: null }
  }

  const minutes = durationSeconds / 60
  const charsPerMinute = text.length / minutes
  const floor = MEASURED_CHARS_PER_MINUTE * MIN_DENSITY_RATIO

  if (charsPerMinute < floor) {
    return {
      usable: false,
      reason: "too_sparse_for_duration",
      message:
        `الترجمة لا تغطي الحلقة — ${Math.round(charsPerMinute)} حرف/دقيقة ` +
        `مقابل ~${MEASURED_CHARS_PER_MINUTE} متوقعة لحلقة ${Math.round(minutes)} دقيقة`,
      charsPerMinute,
    }
  }

  return { usable: true, reason: "ok", charsPerMinute }
}

/**
 * Fetch YouTube captions and REJECT a track that is not a plausible
 * transcript of this episode — the same gate the Studio pipeline uses.
 *
 * Why the episode features outside the Studio need it: the wave-2 change
 * to `fetchTranscriptServer` made track selection deterministic, and the
 * track it now prefers is the human-written one. That is the right
 * default for text quality, but partial manual subtitle tracks are common
 * on YouTube — so a preference that used to be a coin flip is now a
 * consistent choice, and without a gate a track covering a fraction of
 * the episode silently becomes the source for quotes attributed to the
 * guest on the public page.
 *
 * Duration is read from the `episodes` row so the density check has real
 * teeth; if it is unknown the gate degrades to the length floor alone
 * rather than inventing a threshold.
 */
export async function fetchGatedTranscript(
  videoId: string,
  episodeId?: string | null,
): Promise<
  { ok: true; text: string; clean: string } | { ok: false; error: string }
> {
  const result = await fetchTranscriptServer(videoId)
  if (!result.success || !result.text) {
    return { ok: false, error: result.error || "فشل في جلب النص" }
  }

  let durationSeconds: number | null = null
  if (episodeId && db) {
    try {
      const rows = await db
        .select({ minutes: episodes.duration_minutes })
        .from(episodes)
        .where(eq(episodes.id, episodeId))
        .limit(1)
      const minutes = rows[0]?.minutes
      if (typeof minutes === "number" && minutes > 0) durationSeconds = minutes * 60
    } catch (err) {
      console.error("[caption-gate] duration lookup failed:", err)
    }
  }

  const clean = cleanTranscriptText(result.text)
  const verdict = assessCaptionQuality(clean, durationSeconds)
  if (!verdict.usable) {
    console.warn(
      `[caption-gate] ${videoId} rejected (${verdict.reason}): ${verdict.message}`,
    )
    return {
      ok: false,
      error: verdict.message || "الترجمة التلقائية غير صالحة لهذه الحلقة",
    }
  }

  return { ok: true, text: result.text, clean }
}
