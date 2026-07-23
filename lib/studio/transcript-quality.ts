/**
 * Studio 3-phase journey — WHISPER TRANSCRIPT DEGENERACY guard (Phase-1, Step 6).
 *
 * The Phase-1 anti-fabrication spine (`lib/ai/episode-map.ts`) proves the MODEL's
 * numbers and ids are honest. It does NOT prove whisper's TEXT is real. Whisper
 * degrades by LOOPING — emitting the SAME short segment dozens/hundreds of times
 * in a row — and it does this specifically on raw audio with silence / long
 * breaks, which is EXACTLY Khaled's upload (raw unedited recording, pre-roll
 * chatter, mid-episode breaks). Noura observed a real run where a splice produced
 * 153 identical "ثاني" segments from 222s→530s.
 *
 * A loop that stays inside the time bounds passes EVERY existing self-check: the
 * offsets stay monotonic, the durations still reconstitute the file, and the
 * `first_real_sentence` proof verifies because a looped phrase IS a valid
 * substring of its window. So a time map built on hallucinated text gets trusted
 * and the true_start / hooks point the editor at garbage.
 *
 * This module is the missing TEXT check: a pure, deterministic verdict on whether
 * a transcript is degenerate BEFORE a map is built or trusted. It reuses the
 * existing `normalizeArabic` (`lib/search.ts`) — no new normalizer — and is styled
 * after `segments.ts`: it reports evidence, and the caller THROWS on a degenerate
 * verdict rather than emit a map over hallucinated text.
 *
 * ── INTER-segment signals (a loop ACROSS segments) ────────────────────────────
 *   - `maxConsecutiveRun` — the longest run of consecutive IDENTICAL normalized
 *     segments. This is the loop SIGNATURE: natural conversational speech — even a
 *     speaker repeating a word for emphasis, or a recurring show tag like
 *     "بودكاست خط" — does not emit the same normalized string many times BACK TO
 *     BACK; whisper stuck in a decoding loop does. Critically, a consecutive-run
 *     metric catches a LOCAL loop even when the rest of the episode is healthy
 *     (Noura's case: 153 identical segments embedded in an otherwise-varied 2h
 *     transcript, where a GLOBAL uniqueness ratio would stay high — ~0.87 — and
 *     miss it entirely). This is why the run metric is the PRIMARY, standalone
 *     signal.
 *   - `uniquenessRatio` — distinct normalized segments / total. A real
 *     conversation is ~0.85–1.0 unique; a transcript whose variety has collapsed
 *     is mostly repeats. Used ONLY to corroborate a shorter (and thus more
 *     ambiguous) run — never on its own — so it can never reject a healthy
 *     transcript.
 *
 * ── INTRA-segment signals (a loop WITHIN one segment) ─────────────────────────
 * Whisper also hallucinates INSIDE a single segment — replacing ~26s of quiet
 * mic-check speech with one garbled segment (Noura proved a real case: 209
 * consecutive identical characters "ووو…"). Such a segment is UNIQUE, so every
 * inter-segment signal above passes it (`maxConsecutiveRun=1`, `uniquenessRatio=
 * 1.0`) — and a KEPT region compared against that hallucinated text then reads as
 * "the real words are absent", producing a FALSE ✅ "you cut this" when the audio
 * was never cut. That is exactly the failure the honesty principle exists to
 * prevent. Three text-only signals catch it (each self-sufficient — correctness
 * never depends on whisper metadata being present):
 *   - `maxIntraCharRun` — longest run of a single identical character inside one
 *     segment. A healthy segment ≈ 2–3 (even an elongated word "ماشاااء"); a
 *     decoding loop is dozens–hundreds. The PRIMARY intra signal (catches 209).
 *   - `maxIntraTokenRun` — longest run of the SAME token repeated back-to-back
 *     inside one segment (catches "ثاني ثاني ثاني…" collapsed into one segment).
 *   - `minLongSegmentDiversity` — for a LONG segment (>15s, which should carry
 *     rich vocabulary) the distinct-token ratio; a value this low means the
 *     segment's variety has collapsed (a 2–3-word phrase looped for 20s).
 * Plus one OPTIONAL corroborating signal when whisper metadata is available:
 *   - `maxSegmentCompressionRatio` — whisper's own per-segment `compression_ratio`
 *     (len/gzip(len)); >~2.4 is the STANDARD repetition flag (whisper's own decoder
 *     threshold). Additive only — undefined for VTT/hand-built segments, so the
 *     text signals above must (and do) stand entirely on their own.
 */

import { normalizeArabic } from "@/lib/search"
import type { TimedSegment } from "@/lib/studio/segments"

// ─── Calibration constants ───────────────────────────────────────────────────
// Every threshold below is a JUDGMENT CALL that NEEDS CALIBRATION against a corpus
// of real خط بودكاست raw uploads (like Step 3's constants), NOT a proven number.
// They are deliberately CONSERVATIVE per Khaled's bar: it is better to occasionally
// pass a slightly-degenerate transcript than to REJECT a good one and fail a real
// job — BUT a clear loop (dozens of identical consecutive segments) MUST be caught.
// Named + documented; never inlined at the call site.

/**
 * A run of this many IDENTICAL consecutive normalized segments is treated as an
 * unmistakable whisper loop ON ITS OWN, regardless of the rest of the transcript.
 *
 * Justification: natural Arabic conversational speech does not produce 10+ byte-
 * identical consecutive whisper segments — whisper folds a genuinely repeated
 * short word ("لا، لا، لا") into ONE segment or two, not ten. The real loop Noura
 * observed was 153 (≈15× this floor), so this could be set far higher and still
 * catch the real case; 10 is the conservative floor that leaves generous headroom
 * for emphatic real repetition (3–4×) so a good transcript is never rejected.
 * CALIBRATION: if a real episode ever legitimately trips this, raise it.
 */
export const HARD_LOOP_RUN_LENGTH = 10

/**
 * A run shorter than HARD_LOOP_RUN_LENGTH is ambiguous (could be emphatic real
 * repetition), so it counts as a loop ONLY when the transcript's OVERALL variety
 * has also collapsed (see MIN_UNIQUENESS_RATIO). This is the corroborated,
 * two-signal path — it never fires on a healthy (high-uniqueness) transcript.
 * CALIBRATION: tune together with MIN_UNIQUENESS_RATIO on real episodes.
 */
export const SUSPECT_LOOP_RUN_LENGTH = 5

/**
 * uniquenessRatio (distinct/total) at/below which the transcript is judged to have
 * collapsed variety. A healthy conversation sits far above this (~0.85–1.0), so a
 * value this low means most segments are repeats — a hallmark of a degraded /
 * looped transcription. Used ONLY to corroborate a SUSPECT_LOOP_RUN_LENGTH run.
 * CALIBRATION: measure real-episode uniqueness distributions; keep this below the
 * observed minimum for healthy transcripts.
 */
export const MIN_UNIQUENESS_RATIO = 0.3

/**
 * The corroborated (ratio-based) path only runs once there are enough segments for
 * the ratio to be meaningful — a short intro/teaser clip must NOT be judged on a
 * uniqueness ratio (3 of 5 unique is not a "loop"). The HARD run path has no such
 * floor: a 10-long identical run is a loop at any transcript length.
 * CALIBRATION: raise if short legitimate clips ever get judged on the ratio.
 */
export const MIN_SEGMENTS_FOR_RATIO = 20

// ─── Intra-segment calibration constants (Finding #1) ────────────────────────
// A hallucinated SINGLE segment is UNIQUE, so it evades every inter-segment
// signal above. These catch it from the segment's own TEXT. Same conservative
// bar: never reject a good transcript, but the proven "209-char / 26s garbled
// segment" MUST be caught. All named + documented; NEEDS CALIBRATION on a corpus
// of real خط بودكاست raw uploads. Flagged for calibration like Step 3's constants.

/**
 * Longest run of a single IDENTICAL character inside one segment that is treated
 * as an unmistakable intra-segment whisper loop ON ITS OWN.
 *
 * Justification: real Arabic speech — even a legitimately elongated word
 * ("ماشاااء", "صحيييح") — rarely exceeds ~3–8 identical characters back to back.
 * Noura's proven hallucination was 209 (≈8× this floor), so 25 catches the real
 * case with huge headroom while leaving generous room above any natural
 * elongation so a good transcript is never rejected.
 * CALIBRATION: if a real segment ever legitimately trips this, raise it.
 */
export const HARD_INTRA_CHAR_RUN_LENGTH = 25

/**
 * Longest run of the SAME token repeated back-to-back inside one segment that is
 * treated as an intra-segment loop ON ITS OWN (catches a word-loop like
 * "ثاني ثاني ثاني…" that whisper packed into ONE segment rather than many).
 * Mirrors the inter-segment HARD_LOOP_RUN_LENGTH rationale: whisper folds a
 * genuinely repeated short word into 1–2 tokens, not ten. CALIBRATION: raise if
 * a real emphatic repetition ever trips it.
 */
export const HARD_INTRA_TOKEN_RUN_LENGTH = 10

/**
 * A segment longer than this (seconds) is expected to carry rich vocabulary, so
 * it is eligible for the collapsed-diversity check below. Short segments are NOT
 * — a real 3s "لا لا لا لا" is legitimate and must pass. NEEDS CALIBRATION.
 */
export const INTRA_LOW_VOCAB_MIN_SECONDS = 15

/**
 * A long segment must also have at least this many tokens before its diversity
 * ratio is trusted — too few tokens make the ratio noisy. NEEDS CALIBRATION.
 */
export const INTRA_LOW_VOCAB_MIN_TOKENS = 15

/**
 * distinct-tokens / total-tokens at/below which a LONG segment (see above) is
 * judged to have collapsed vocabulary — a 2–3-word phrase looped for 15s+ ("طيب
 * يعني ماشي طيب يعني ماشي…"). Real speech of that length sits far higher (~0.6–1.0),
 * so this cleanly separates a loop from dense-but-real speech. NEEDS CALIBRATION.
 */
export const MIN_INTRA_TOKEN_DIVERSITY = 0.2

/**
 * Whisper per-segment `compression_ratio` at/above which the segment is flagged
 * as likely-repetition. 2.4 is whisper's OWN decoder threshold for degeneracy —
 * evidence-based, not a guess. OPTIONAL corroboration only: undefined for
 * VTT/hand-built segments, and the text signals above already catch the real
 * cases without it. CALIBRATION: raise if real dense Arabic speech trips it.
 */
export const MAX_SEGMENT_COMPRESSION_RATIO = 2.4

/**
 * The compression_ratio signal is ignored below this many characters — whisper's
 * ratio is noisy on very short segments, which cannot host a real loop anyway.
 */
export const COMPRESSION_SIGNAL_MIN_CHARS = 20

/** The operator-facing failure message when a transcript is judged degenerate. */
export const DEGENERATE_TRANSCRIPT_MESSAGE =
  "تعذّر إنتاج خريطة موثوقة: التفريغ يحتوي تكراراً غير طبيعي — " +
  "غالباً تشويش/صمت طويل في التسجيل. حاول مرة أخرى"

/**
 * The operator-facing failure message when the EDITED-audio transcription (the
 * fresh whisper pass in the Phase-2 review job) is judged degenerate. Same root
 * cause + same core explanation as DEGENERATE_TRANSCRIPT_MESSAGE, but the lead-in
 * fits the review context (no map is produced here — a review of the edits is),
 * so the operator sees why the review FAILED rather than a "map" message that does
 * not apply to this phase.
 */
export const DEGENERATE_EDITED_TRANSCRIPT_MESSAGE =
  "تعذّر مراجعة التعديلات: تفريغ الصوت المعدّل يحتوي تكراراً غير طبيعي — " +
  "غالباً تشويش/صمت طويل في التسجيل. حاول مرة أخرى"

// ─── Verdict shape ───────────────────────────────────────────────────────────

export interface TranscriptDegeneracyMetrics {
  /** Non-empty normalized segments considered (empty-after-normalize dropped). */
  totalSegments: number
  /** Count of DISTINCT normalized segment texts. */
  uniqueSegments: number
  /** uniqueSegments / totalSegments (1 when there is nothing to judge). */
  uniquenessRatio: number
  /** Longest run of consecutive IDENTICAL normalized segments (0 when empty). */
  maxConsecutiveRun: number
  /** Normalized text of that longest run, or null when the run is ≤ 1. */
  loopText: string | null
  /** Absolute start second of that run, or null when the run is ≤ 1. */
  loopStartSeconds: number | null
  /** Absolute end second of that run, or null when the run is ≤ 1. */
  loopEndSeconds: number | null
  // ── Intra-segment (single hallucinated segment) evidence (Finding #1) ──
  /** Longest run of one identical character found WITHIN any single segment. */
  maxIntraCharRun: number
  /** Longest run of the same token repeated WITHIN any single segment. */
  maxIntraTokenRun: number
  /** Lowest distinct-token ratio among LONG segments (1 when none qualify). */
  minLongSegmentDiversity: number
  /** Highest whisper compression_ratio seen (null when no segment carried one). */
  maxSegmentCompressionRatio: number | null
  /** Normalized text of the worst intra-segment offender, or null. */
  intraText: string | null
  /** Absolute start second of the worst intra-segment offender, or null. */
  intraStartSeconds: number | null
  /** Absolute end second of the worst intra-segment offender, or null. */
  intraEndSeconds: number | null
}

export interface TranscriptDegeneracyVerdict {
  degenerate: boolean
  /** English diagnostic (which rule fired + metrics). Empty when not degenerate. */
  reason: string
  metrics: TranscriptDegeneracyMetrics
}

/** Collapse whitespace to single spaces + trim — generic cleanup, not a normalizer. */
function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim()
}

/**
 * Longest run of one IDENTICAL character in `text` (Unicode code points; a space
 * never counts, so a token boundary breaks the run). "ووو…209" → 209; a normal
 * segment ≈ 2–3; an elongated word "ماشاااء" → 3. Pure, no normalization here —
 * it runs on the already-normalized text.
 */
function longestCharRun(text: string): number {
  let max = 0
  let cur = 0
  let prev: string | null = null
  for (const ch of text) {
    if (ch === prev) cur++
    else {
      cur = 1
      prev = ch
    }
    if (ch !== " " && cur > max) max = cur
  }
  return max
}

/** Longest run of the SAME token repeated back-to-back in `tokens`. */
function longestTokenRun(tokens: string[]): number {
  let max = 0
  let cur = 0
  let prev: string | null = null
  for (const t of tokens) {
    if (t === prev) cur++
    else {
      cur = 1
      prev = t
    }
    if (cur > max) max = cur
  }
  return max
}

/** Per-segment intra-degeneracy evidence + the first rule (if any) it trips. */
interface IntraSegmentSignal {
  charRun: number
  tokenRun: number
  /** distinct/total tokens (1 when no tokens) — only meaningful for long segments. */
  diversity: number
  /** True when the segment is long enough for the diversity rule to apply. */
  isLong: boolean
  compressionRatio: number | null
  /** English description of the tripped rule, or null when the segment is clean. */
  reason: string | null
}

/**
 * Assess ONE segment for an intra-segment hallucination from its normalized text
 * (+ optional whisper compression_ratio). Text signals are self-sufficient; the
 * compression signal is corroboration only and is skipped when absent.
 */
function assessSegmentIntra(
  text: string,
  durationSeconds: number,
  compressionRatio: number | null,
): IntraSegmentSignal {
  const charRun = longestCharRun(text)
  const tokens = text.split(" ").filter(Boolean)
  const tokenRun = longestTokenRun(tokens)
  const distinct = new Set(tokens).size
  const diversity = tokens.length > 0 ? distinct / tokens.length : 1
  const isLong =
    Number.isFinite(durationSeconds) &&
    durationSeconds >= INTRA_LOW_VOCAB_MIN_SECONDS &&
    tokens.length >= INTRA_LOW_VOCAB_MIN_TOKENS

  let reason: string | null = null
  if (charRun >= HARD_INTRA_CHAR_RUN_LENGTH) {
    reason =
      `single-character run of ${charRun} (≥ ${HARD_INTRA_CHAR_RUN_LENGTH}) in one segment`
  } else if (tokenRun >= HARD_INTRA_TOKEN_RUN_LENGTH) {
    reason =
      `identical-token run of ${tokenRun} (≥ ${HARD_INTRA_TOKEN_RUN_LENGTH}) in one segment`
  } else if (isLong && diversity <= MIN_INTRA_TOKEN_DIVERSITY) {
    reason =
      `${durationSeconds.toFixed(1)}s segment with collapsed vocabulary ` +
      `(token diversity ${diversity.toFixed(3)} ≤ ${MIN_INTRA_TOKEN_DIVERSITY})`
  } else if (
    compressionRatio != null &&
    compressionRatio >= MAX_SEGMENT_COMPRESSION_RATIO &&
    text.length >= COMPRESSION_SIGNAL_MIN_CHARS
  ) {
    reason =
      `whisper compression_ratio ${compressionRatio.toFixed(2)} ` +
      `(≥ ${MAX_SEGMENT_COMPRESSION_RATIO}) in one segment`
  }

  return { charRun, tokenRun, diversity, isLong, compressionRatio, reason }
}

/**
 * Judge whether a whisper transcript is DEGENERATE (a decoding loop of repeated
 * identical segments) — pure + deterministic, no I/O, no AI. Reuses the existing
 * `normalizeArabic` so "ثانِي" / "ثاني" / "ثانى" collapse to one form before any
 * comparison.
 *
 * A `degenerate: true` verdict means the caller MUST NOT build or trust a map on
 * these segments (the true_start / hooks / substring-proof would all point at
 * looped garbage while passing every downstream self-check).
 */
export function assessTranscriptDegeneracy(
  segments: TimedSegment[],
): TranscriptDegeneracyVerdict {
  // Normalize once (existing normalizeArabic + generic whitespace collapse — NOT a
  // new normalizer) and drop segments that are empty after normalization: they are
  // noise and should neither count as unique content nor break a loop run.
  const normed: Array<{ text: string; seg: TimedSegment }> = []
  for (const seg of segments) {
    const text = collapseWhitespace(normalizeArabic(seg.text ?? ""))
    if (text.length === 0) continue
    normed.push({ text, seg })
  }

  const total = normed.length
  const emptyMetrics: TranscriptDegeneracyMetrics = {
    totalSegments: total,
    uniqueSegments: 0,
    uniquenessRatio: 1,
    maxConsecutiveRun: 0,
    loopText: null,
    loopStartSeconds: null,
    loopEndSeconds: null,
    maxIntraCharRun: 0,
    maxIntraTokenRun: 0,
    minLongSegmentDiversity: 1,
    maxSegmentCompressionRatio: null,
    intraText: null,
    intraStartSeconds: null,
    intraEndSeconds: null,
  }
  // Nothing to judge — the map builder has its own no-segments throw; not our job.
  if (total === 0) {
    return { degenerate: false, reason: "", metrics: emptyMetrics }
  }

  const uniqueSegments = new Set(normed.map((n) => n.text)).size
  const uniquenessRatio = uniqueSegments / total

  // Longest run of consecutive identical normalized segments, tracking its span.
  let maxRun = 0
  let maxRunStartIdx = 0
  let curRun = 0
  let curRunStartIdx = 0
  for (let i = 0; i < total; i++) {
    if (i > 0 && normed[i].text === normed[i - 1].text) {
      curRun++
    } else {
      curRun = 1
      curRunStartIdx = i
    }
    if (curRun > maxRun) {
      maxRun = curRun
      maxRunStartIdx = curRunStartIdx
    }
  }

  const hasRun = maxRun >= 2
  const loopText = hasRun ? normed[maxRunStartIdx].text : null
  const loopStartSeconds = hasRun ? normed[maxRunStartIdx].seg.start : null
  const loopEndSeconds = hasRun ? normed[maxRunStartIdx + maxRun - 1].seg.end : null

  // ── Intra-segment scan: a single hallucinated segment (unique, so invisible to
  //    every inter-segment signal above) judged from its own text (Finding #1). ──
  let maxIntraCharRun = 0
  let maxIntraTokenRun = 0
  let minLongSegmentDiversity = 1
  let maxSegmentCompressionRatio: number | null = null
  let intraReason: string | null = null
  let intraText: string | null = null
  let intraStartSeconds: number | null = null
  let intraEndSeconds: number | null = null

  for (const { text, seg } of normed) {
    const cr =
      typeof seg.compressionRatio === "number" && Number.isFinite(seg.compressionRatio)
        ? seg.compressionRatio
        : null
    const s = assessSegmentIntra(text, seg.end - seg.start, cr)

    if (s.charRun > maxIntraCharRun) maxIntraCharRun = s.charRun
    if (s.tokenRun > maxIntraTokenRun) maxIntraTokenRun = s.tokenRun
    if (s.isLong && s.diversity < minLongSegmentDiversity) minLongSegmentDiversity = s.diversity
    if (cr != null && (maxSegmentCompressionRatio == null || cr > maxSegmentCompressionRatio)) {
      maxSegmentCompressionRatio = cr
    }
    // Keep the FIRST offending segment for the diagnostic reason.
    if (intraReason === null && s.reason !== null) {
      intraReason = s.reason
      intraText = text
      intraStartSeconds = seg.start
      intraEndSeconds = seg.end
    }
  }

  const metrics: TranscriptDegeneracyMetrics = {
    totalSegments: total,
    uniqueSegments,
    uniquenessRatio,
    maxConsecutiveRun: maxRun,
    loopText,
    loopStartSeconds,
    loopEndSeconds,
    maxIntraCharRun,
    maxIntraTokenRun,
    minLongSegmentDiversity,
    maxSegmentCompressionRatio,
    intraText,
    intraStartSeconds,
    intraEndSeconds,
  }

  // ── Decision ────────────────────────────────────────────────────────────────
  // (A) HARD, standalone: a run this long is a whisper loop regardless of context
  //     — this is what catches a LOCAL loop inside an otherwise-healthy transcript.
  const hardLoop = maxRun >= HARD_LOOP_RUN_LENGTH
  // (B) CORROBORATED: a shorter (ambiguous) run counts only when overall variety
  //     has also collapsed AND there are enough segments to trust the ratio.
  const corroboratedLoop =
    total >= MIN_SEGMENTS_FOR_RATIO &&
    maxRun >= SUSPECT_LOOP_RUN_LENGTH &&
    uniquenessRatio <= MIN_UNIQUENESS_RATIO

  // (C) INTRA, standalone: a single hallucinated segment (Finding #1). Any of its
  //     text signals (char-run / token-run / collapsed long-segment vocabulary) or
  //     the optional compression_ratio signal is enough on its own.
  const intraLoop = intraReason !== null

  const degenerate = hardLoop || corroboratedLoop || intraLoop
  if (!degenerate) {
    return { degenerate: false, reason: "", metrics }
  }

  const parts: string[] = []
  if (hardLoop || corroboratedLoop) {
    const which = hardLoop
      ? `consecutive-identical run of ${maxRun} segments (≥ ${HARD_LOOP_RUN_LENGTH})`
      : `run of ${maxRun} (≥ ${SUSPECT_LOOP_RUN_LENGTH}) with collapsed uniqueness ` +
        `${uniquenessRatio.toFixed(3)} (≤ ${MIN_UNIQUENESS_RATIO})`
    const span =
      loopStartSeconds != null && loopEndSeconds != null
        ? ` spanning ${loopStartSeconds.toFixed(1)}s→${loopEndSeconds.toFixed(1)}s`
        : ""
    const quoted = loopText ? ` — repeated: "${loopText.slice(0, 40)}"` : ""
    parts.push(`${which}${span}${quoted}; ${uniqueSegments}/${total} unique segments`)
  }
  if (intraLoop && intraReason) {
    const span =
      intraStartSeconds != null && intraEndSeconds != null
        ? ` spanning ${intraStartSeconds.toFixed(1)}s→${intraEndSeconds.toFixed(1)}s`
        : ""
    const quoted = intraText ? ` — segment text: "${intraText.slice(0, 40)}"` : ""
    parts.push(`intra-segment hallucination — ${intraReason}${span}${quoted}`)
  }

  const reason = `degenerate transcript: ${parts.join("; ")}`

  return { degenerate: true, reason, metrics }
}
