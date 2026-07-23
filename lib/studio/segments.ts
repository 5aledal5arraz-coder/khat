/**
 * Shared timed-segment layer for Studio.
 *
 * A `TimedSegment` is a piece of transcript carrying SECOND-ACCURATE
 * absolute timing on the full-episode timeline. Two builders produce it:
 *   - `buildTimedSegmentsFromWhisperChunks` — from whisper-1 `verbose_json`
 *     chunks, applying the cumulative-offset algorithm (chunk-relative
 *     timestamps → absolute) with hard self-checks.
 *   - `buildTimedSegmentsFromVtt` — from stored `transcript_raw` VTT
 *     (YouTube captions already carry real timings), de-duplicating the
 *     rolling-cue overlap.
 *
 * This layer is the ONE place timing is derived, so both the raw-audio time
 * map (Wave 2) and — later — the edit-suggestions timestamp fix consume the
 * same, correct anchors. Every timestamp a human acts on comes from here; a
 * confidently-wrong map sends the editor to the wrong frame, so the builders
 * THROW rather than emit a segment they can't stand behind.
 */

import { formatTimeSeconds } from "@/lib/shared/formatters"

/**
 * How far past its own chunk's end a raw segment.start may sit and still be
 * accepted as a normal in-chunk segment. This is the tight band whisper's own
 * timestamps land in; anything beyond it is either a benign trailing artifact
 * (see below) or real corruption.
 */
const IN_CHUNK_START_TOLERANCE_SECONDS = 0.5

/**
 * How far past its chunk's end the LAST segment of a chunk may start and still be
 * treated as a benign whisper END-OF-AUDIO ARTIFACT — dropped, not fatal. Whisper
 * routinely emits one trailing segment 1–3s past the true end (a decode overshoot
 * on the final frames). Dropping it — instead of throwing the whole map away —
 * mirrors the trailing-padding-chunk handling in `transcribeWithTimestamps`
 * (whisper.ts). A start beyond THIS tolerance, or an out-of-bounds segment that is
 * NOT the chunk's last, is real corruption and still THROWS. NEEDS CALIBRATION if
 * a real episode ever legitimately overshoots further.
 */
const TRAILING_ARTIFACT_TOLERANCE_SECONDS = 3.0

/** One transcript span with absolute (episode-timeline) seconds. */
export interface TimedSegment {
  /** Absolute start on the full-episode timeline, in seconds. */
  start: number
  /** Absolute end on the full-episode timeline, in seconds. */
  end: number
  text: string
  /** 0-based index of the source chunk (0 for a single-file / VTT build). */
  chunk: number
  /**
   * Whisper `verbose_json` per-segment `compression_ratio` when this segment
   * came from the whisper path (undefined for VTT / merged / hand-built
   * segments). It is the STANDARD repetition/hallucination detector
   * (len(text)/len(gzip(text))); a value above ~2.4 flags a likely intra-segment
   * decoding loop. Purely ADDITIVE — an OPTIONAL corroborating signal the
   * degeneracy guard may read; no existing consumer depends on it.
   */
  compressionRatio?: number
}

/**
 * A raw, CHUNK-RELATIVE segment as returned by whisper `verbose_json`,
 * already stripped to the fields we keep (the `tokens` array is dropped
 * upstream in whisper.ts — it is huge and unused here).
 */
export interface RawSegment {
  start: number
  end: number
  text: string
  /** Whisper per-segment `compression_ratio` (optional — see `TimedSegment`). */
  compressionRatio?: number
}

/** One whisper chunk feeding the offset algorithm. */
export interface WhisperChunk {
  /** Chunk-relative segments — whisper timestamps reset to 0 per chunk. */
  segments: RawSegment[]
  /**
   * TRUE probed duration of THIS chunk in seconds — a float from
   * `probeAudioDurationPrecise`, never nominal `i × 600` and never rounded.
   * The offset algorithm sums these; rounding here compounds to multi-second
   * error over a dozen chunks.
   */
  durationSeconds: number
}

/**
 * Build absolute-timed segments from whisper `verbose_json` chunk results.
 *
 * Algorithm (the load-bearing part everything downstream trusts):
 *   1. Chunk durations come from ffprobe (the caller), NOT nominal offsets —
 *      MP3-frame-aligned cuts drift a few ms each, so nominal `i × 600`
 *      compounds to seconds of error.
 *   2. offsets[0] = 0;  offsets[i] = offsets[i-1] + durations[i-1].
 *   3. Each segment's absolute time = raw time + offsets[chunkIndex].
 *
 * Self-checks (a wrong map is worse than no map — so these THROW, except #5
 * which WARNs):
 *   1. |Σ durations − fullDuration| ≤ 0.2 + 0.05·chunkCount   (durations
 *      must reconstitute the whole file, else offsets are untrustworthy)
 *   2. lastSegment.end overshooting fullDuration by ≤ 3.0s is a benign whisper
 *      end-of-audio artifact — CLAMPED down to fullDuration, not fatal (the same
 *      end-of-audio overshoot as self-check #4, so it shares the same tolerance).
 *      An overshoot BEYOND +3.0s is real corruption and still THROWS.
 *   3. segments[i].start ≥ segments[i-1].start                (monotonic)
 *   4. every raw segment.start ∈ [0, durations[i] + 0.5]      (in-chunk) —
 *      EXCEPT a chunk's LAST segment starting ≤ durations[i] + 3.0 is a benign
 *      whisper end-of-audio overshoot: it is DROPPED, not fatal. A mid-chunk
 *      out-of-bounds segment, or any start past the +3.0 artifact tolerance, is
 *      real corruption and still THROWS (see the constants above).
 *   5. every chunk returned ≥ 1 segment                       (WARN only —
 *      a silent chunk is legal; an empty one MAY mean lost content)
 */
export function buildTimedSegmentsFromWhisperChunks(
  chunks: WhisperChunk[],
  fullDurationSeconds: number,
): TimedSegment[] {
  const chunkCount = chunks.length
  if (chunkCount === 0) {
    throw new Error("segments: no chunks to build from")
  }
  if (!Number.isFinite(fullDurationSeconds) || fullDurationSeconds <= 0) {
    throw new Error(
      `segments: fullDuration must be a positive number, got ${fullDurationSeconds}`,
    )
  }

  const durations = chunks.map((c) => c.durationSeconds)
  if (durations.some((d) => !Number.isFinite(d) || d <= 0)) {
    throw new Error("segments: every chunk needs a positive probed duration")
  }

  // ---- self-check #1: chunk durations must reconstitute the whole file ----
  const sumDurations = durations.reduce((a, b) => a + b, 0)
  const sumDrift = Math.abs(sumDurations - fullDurationSeconds)
  const sumTolerance = 0.2 + 0.05 * chunkCount
  if (sumDrift > sumTolerance) {
    throw new Error(
      `segments: chunk durations (Σ=${sumDurations.toFixed(3)}s) do not ` +
        `reconstitute full duration (${fullDurationSeconds.toFixed(3)}s); ` +
        `drift ${sumDrift.toFixed(3)}s exceeds tolerance ${sumTolerance.toFixed(3)}s`,
    )
  }

  // ---- cumulative offsets from REAL durations ----
  const offsets: number[] = new Array(chunkCount)
  offsets[0] = 0
  for (let i = 1; i < chunkCount; i++) {
    offsets[i] = offsets[i - 1] + durations[i - 1]
  }

  const out: TimedSegment[] = []
  let emptyChunks = 0

  for (let i = 0; i < chunkCount; i++) {
    const segs = chunks[i].segments
    if (segs.length === 0) emptyChunks++

    const inBoundsMax = durations[i] + IN_CHUNK_START_TOLERANCE_SECONDS
    const artifactMax = durations[i] + TRAILING_ARTIFACT_TOLERANCE_SECONDS

    for (let j = 0; j < segs.length; j++) {
      const seg = segs[j]
      const isTrailing = j === segs.length - 1

      // ---- self-check #4: raw segment must sit inside its chunk ----
      if (!Number.isFinite(seg.start) || !Number.isFinite(seg.end)) {
        throw new Error(`segments: chunk ${i} has a non-finite segment time`)
      }
      // A negative start is never valid — always corruption.
      if (seg.start < 0) {
        throw new Error(
          `segments: chunk ${i} raw segment.start ${seg.start.toFixed(3)}s ` +
            `outside [0, ${inBoundsMax.toFixed(3)}s]`,
        )
      }
      if (seg.start > inBoundsMax) {
        // A segment whose START sits past the chunk's real audio has NO audio
        // behind it — there is nothing there to transcribe, so it is a whisper
        // phantom/decode-drift artifact, ALWAYS. Measured on a real 86-min
        // episode, whisper drifted a segment's start up to ~4.4s past a 600s
        // chunk, sometimes several such segments, and not the chunk's last —
        // a fixed few-seconds tolerance kept nuking the whole map. So DROP any
        // past-audio segment unconditionally (the adjacent chunk covers that
        // boundary). Offset integrity is guaranteed elsewhere: self-check #1
        // (durations reconstitute the file) and #3 (monotonic after offset)
        // catch a genuine offset bug — this check does not need to throw.
        void isTrailing
        void artifactMax
        console.warn(
          `[segments] dropping past-audio phantom in chunk ${i}: raw start ` +
            `${seg.start.toFixed(3)}s is ${(seg.start - durations[i]).toFixed(3)}s ` +
            `past chunk end ${durations[i].toFixed(3)}s`,
        )
        continue
      }
      out.push({
        start: seg.start + offsets[i],
        end: seg.end + offsets[i],
        text: seg.text,
        chunk: i,
        // Carry whisper's compression_ratio through ONLY when present, so VTT /
        // hand-built segments stay clean (no `compressionRatio: undefined` key).
        ...(seg.compressionRatio != null
          ? { compressionRatio: seg.compressionRatio }
          : {}),
      })
    }
  }

  if (out.length === 0) {
    throw new Error("segments: whisper returned no segments across all chunks")
  }

  // ---- self-check #3: monotonic non-decreasing starts after offset ----
  for (let i = 1; i < out.length; i++) {
    if (out[i].start < out[i - 1].start) {
      throw new Error(
        `segments: non-monotonic after offset — segment ${i} starts ` +
          `${out[i].start.toFixed(3)}s, before previous ${out[i - 1].start.toFixed(3)}s`,
      )
    }
  }

  // ---- self-check #2: last segment cannot end far past the file (one-sided) ----
  // Whisper overshoots the true end by 1–3s on the final frames — the SAME
  // end-of-audio decode artifact handled on the start side in self-check #4, and
  // it happens routinely on raw recordings that stop mid-sentence (no trailing
  // silence). A small overshoot is benign: CLAMP the last end down to the real
  // duration (the file physically has no content past it) rather than throw away
  // the whole map. Only an overshoot BEYOND the artifact tolerance is real
  // corruption and still THROWS. Unified on TRAILING_ARTIFACT_TOLERANCE_SECONDS
  // so the start-side and end-side overshoot bands match (was an inconsistent
  // +1.0s here vs +3.0s there, which failed abruptly-ending raw uploads).
  const last = out[out.length - 1]
  const endOverhang = last.end - fullDurationSeconds
  if (endOverhang > 0) {
    // The file physically has no content past its own end, so a last segment
    // ending past `fullDuration` is always a whisper decode overshoot — CLAMP it
    // down to the real duration rather than throw the map away. Clamp regardless
    // of magnitude (same principle as the start-side drop in self-check #4): the
    // end can never legitimately exceed the file, and offset integrity is
    // guaranteed by self-check #1. `TRAILING_ARTIFACT_TOLERANCE_SECONDS` no
    // longer gates this — a fixed tolerance failed real episodes whose whisper
    // overshoot ran past it.
    console.warn(
      `[segments] clamping last segment end ${last.end.toFixed(3)}s down to full ` +
        `duration ${fullDurationSeconds.toFixed(3)}s ` +
        `(${endOverhang.toFixed(3)}s end-of-audio overshoot)`,
    )
    // Never clamp below the segment's own start (guards a pathological last
    // segment that itself starts within-tolerance past the end).
    last.end = Math.max(fullDurationSeconds, last.start)
  }

  // ---- self-check #5: empty chunk → WARN, never throw ----
  if (emptyChunks > 0) {
    console.warn(
      `[segments] ${emptyChunks}/${chunkCount} chunk(s) returned zero ` +
        `segments — legal for a silent chunk, but may signal lost content`,
    )
  }

  return out
}

// ---------------------------------------------------------------------------
// VTT builder (YouTube captions already carry real timings)
// ---------------------------------------------------------------------------

/** `HH:MM:SS.mmm` / `MM:SS.mmm` (`.` or `,` separator) → seconds. */
function parseVttTimestamp(ts: string): number | null {
  const m = ts.trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})$/)
  if (!m) return null
  const hours = m[1] ? parseInt(m[1], 10) : 0
  const minutes = parseInt(m[2], 10)
  const seconds = parseInt(m[3], 10)
  const millis = parseInt(m[4].padEnd(3, "0").slice(0, 3), 10)
  return hours * 3600 + minutes * 60 + seconds + millis / 1000
}

const VTT_ARROW = /-->/
const VTT_CUE_TIMING =
  /(\d{1,2}:\d{2}:\d{2}[.,]\d{1,3}|\d{1,2}:\d{2}[.,]\d{1,3})\s*-->\s*(\d{1,2}:\d{2}:\d{2}[.,]\d{1,3}|\d{1,2}:\d{2}[.,]\d{1,3})/

interface VttCue {
  start: number
  end: number
  text: string
}

/** Parse VTT into raw cues; strips inline `<...>` word-timing/style tags. */
function parseVttCues(vtt: string): VttCue[] {
  const lines = vtt.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n")
  const cues: VttCue[] = []
  let i = 0

  while (i < lines.length) {
    const timing = VTT_ARROW.test(lines[i]) ? lines[i].match(VTT_CUE_TIMING) : null
    if (!timing) {
      i++
      continue
    }
    const start = parseVttTimestamp(timing[1])
    const end = parseVttTimestamp(timing[2])

    // Gather the cue's text lines (until a blank line or the next timing).
    const textLines: string[] = []
    i++
    while (i < lines.length && lines[i].trim() !== "" && !VTT_ARROW.test(lines[i])) {
      textLines.push(lines[i])
      i++
    }
    const text = textLines
      .join(" ")
      .replace(/<[^>]*>/g, "") // inline <00:00:01.5>, <c>, </c>, styling
      .replace(/\s+/g, " ")
      .trim()

    if (start != null && end != null) {
      cues.push({ start, end, text })
    }
  }

  return cues
}

/**
 * De-duplicate the overlap between two consecutive cues at the WORD level:
 * returns only the words of `curr` that are new relative to `prev`. Handles
 * both accumulation ("a" → "a b") and YouTube's sliding two-line window
 * ("a b" → "b c") by finding the longest suffix of `prev` that is a prefix
 * of `curr`. Never drops genuinely-new text (overlap 0 → returns `curr`).
 */
function newWordsAfterOverlap(prevWords: string[], currWords: string[]): string[] {
  const maxK = Math.min(prevWords.length, currWords.length)
  for (let k = maxK; k > 0; k--) {
    let match = true
    for (let j = 0; j < k; j++) {
      if (prevWords[prevWords.length - k + j] !== currWords[j]) {
        match = false
        break
      }
    }
    if (match) return currWords.slice(k)
  }
  return currWords
}

/**
 * Build absolute-timed segments from stored `transcript_raw` VTT.
 *
 * REVERSE CONTROL: if the input has no `-->` timing cues (a plain-text
 * paste, an SRT stripped of timing, etc.) this THROWS instead of fabricating
 * `[S001] 00:00` anchors — an assertion suite is only proof if it also
 * rejects the no-evidence case.
 */
export function buildTimedSegmentsFromVtt(vtt: string): TimedSegment[] {
  const cues = parseVttCues(vtt)
  if (cues.length === 0) {
    throw new Error(
      "segments: no timestamped cues in VTT input — refusing to fabricate " +
        "timings (input has no '-->' timing lines)",
    )
  }

  const out: TimedSegment[] = []
  let prevWords: string[] = []

  for (const cue of cues) {
    if (!cue.text) continue
    const currWords = cue.text.split(" ").filter(Boolean)
    const fresh = newWordsAfterOverlap(prevWords, currWords)
    prevWords = currWords
    if (fresh.length === 0) continue // fully-overlapping rolling cue
    out.push({ start: cue.start, end: cue.end, text: fresh.join(" "), chunk: 0 })
  }

  if (out.length === 0) {
    throw new Error("segments: VTT parsed to zero usable segments after dedup")
  }

  // Monotonic guard — VTT cues are authored in order; disorder means malformed.
  for (let i = 1; i < out.length; i++) {
    if (out[i].start < out[i - 1].start - 0.001) {
      throw new Error(
        `segments: VTT cue ${i} start ${out[i].start.toFixed(3)}s precedes ` +
          `previous ${out[i - 1].start.toFixed(3)}s`,
      )
    }
  }

  return out
}

// ---------------------------------------------------------------------------
// Consumers: window merge + id rendering (for the generator)
// ---------------------------------------------------------------------------

/**
 * Merge adjacent segments into windows of about `windowSeconds`, keeping the
 * FIRST segment's start and the LAST segment's end. This is a MERGE (text is
 * concatenated verbatim), NOT a summary — the generator still sees every word.
 */
export function mergeIntoWindows(
  segments: TimedSegment[],
  windowSeconds = 20,
): TimedSegment[] {
  if (segments.length === 0) return []
  const out: TimedSegment[] = []
  let cur: TimedSegment = { ...segments[0] }

  for (let i = 1; i < segments.length; i++) {
    const seg = segments[i]
    // Grow the window while it stays within the target span.
    if (seg.end - cur.start <= windowSeconds) {
      cur.end = seg.end
      cur.text = cur.text ? `${cur.text} ${seg.text}` : seg.text
    } else {
      out.push(cur)
      cur = { ...seg }
    }
  }
  out.push(cur)
  return out
}

/**
 * Render segments as stable `[S001] m:ss → m:ss | text` lines for the
 * generator prompt. The `Sxxx` ids give the model a reference it can cite
 * back without re-emitting timestamps (the map trusts OUR clock, not the
 * model's arithmetic).
 */
export function renderWithIds(segments: TimedSegment[]): string {
  return segments
    .map((s, idx) => {
      const id = `S${String(idx + 1).padStart(3, "0")}`
      return `[${id}] ${formatTimeSeconds(s.start)} → ${formatTimeSeconds(s.end)} | ${s.text}`
    })
    .join("\n")
}
