import { env } from "@/lib/env"
import { execFile } from "child_process"
import { promisify } from "util"
import fs from "fs/promises"
import path from "path"
import OpenAI, { toFile } from "openai"
import { recordAiRun } from "@/lib/ai-router/record-run"
import { classifyError } from "@/lib/ai-router/router"
import {
  buildTimedSegmentsFromWhisperChunks,
  type RawSegment,
  type TimedSegment,
  type WhisperChunk,
} from "@/lib/studio/segments"

const execFileAsync = promisify(execFile)

/**
 * Transcription model. gpt-4o-transcribe supersedes whisper-1: same
 * ~$0.006/min price, measurably lower word-error rate (the gap is
 * largest on non-English audio — our episodes are Arabic). whisper-1
 * still works but is no longer the recommended default.
 */
const TRANSCRIBE_MODEL = "gpt-4o-transcribe"

/**
 * Cheaper fallback used ONLY on a transient primary failure (see
 * FALLBACK_ELIGIBLE_ERRORS). This is a deliberate, manual per-chunk
 * fallback in whisper.ts — audio models are excluded from the router's
 * live model catalog, so there is (intentionally) no automatic
 * FALLBACK_CHAINS entry for them.
 */
const FALLBACK_TRANSCRIBE_MODEL = "gpt-4o-mini-transcribe"

/**
 * Model for the TIMESTAMPED map path. `verbose_json` + segment timestamps is
 * a whisper-1-only capability (gpt-4o-transcribe rejects `verbose_json`), so
 * this path is pinned to whisper-1 by design — it is NOT the text default and
 * has no cheaper fallback (diarize was evaluated and rejected: noisy speaker
 * labels, 3× cost, slower).
 */
const TIMESTAMP_MODEL = "whisper-1"

/**
 * Per-minute USD by transcription model. Confirmed 2026-07-20 against
 * developers.openai.com/api/docs/pricing. Per-minute figures are OpenAI's
 * own "Estimated cost"; real meter is audio tokens. `cost_usd` is
 * nullable, so a missing duration never fabricates a figure: when the
 * audio duration can't be probed we store null instead of guessing.
 */
const TRANSCRIBE_PRICE_PER_MIN: Record<string, number> = {
  "gpt-4o-transcribe": 0.006,
  "gpt-4o-mini-transcribe": 0.003,
  // whisper-1 powers the timestamped map path (verbose_json is whisper-1
  // only). Same $0.006/min as gpt-4o-transcribe; confirmed 2026-07-22 against
  // developers.openai.com/api/docs/pricing. Missing this entry silently wrote
  // its cost_usd as null and dropped it from cost reports.
  "whisper-1": 0.006,
}

/**
 * Error classes that justify falling back to the cheaper model: transient
 * only. Mirrors the router's RETRYABLE_ERROR_CLASSES. On quota_exceeded /
 * auth_failed / bad-input the cheaper model fails identically, so we fail
 * straight through instead of paying for a second doomed call.
 */
const FALLBACK_ELIGIBLE_ERRORS = new Set(["timeout", "rate_limited", "server_error"])

/**
 * Optional linkage so each transcription `ai_runs` row can be attributed
 * to its studio session (and, if the caller has it, its episode). Passed
 * by the studio routes; `subject_table` is the real "studio_sessions"
 * table, never a dropped one.
 */
export interface TranscribeContext {
  eirId?: string | null
  subjectTable?: string | null
  subjectId?: string | null
}

/** USD for one transcription; null when the duration or price is unknown. */
function transcribeCost(model: string, durationSeconds: number | null): number | null {
  const perMin = TRANSCRIBE_PRICE_PER_MIN[model]
  if (perMin == null || durationSeconds == null) return null
  return (durationSeconds / 60) * perMin
}

const WHISPER_MAX_SIZE = 24 * 1024 * 1024 // 24 MB (audio endpoint limit is 25MB, leave margin)
const CHUNK_DURATION_SECONDS = 600 // 10 minutes per chunk

/**
 * When the file length is an exact multiple of the segment time, ffmpeg's
 * segment muxer emits a padding-only trailing chunk (null / near-zero
 * probed duration, a few hundred bytes). Below this many seconds a trailing
 * chunk is treated as that spurious tail and dropped from the timestamp map
 * — never paid for, never allowed to abort an otherwise-valid map.
 */
const MIN_CONTENT_CHUNK_SECONDS = 0.25

interface TranscribeResult {
  success: boolean
  text?: string
  error?: string
}

let client: OpenAI | null = null

function getClient(): OpenAI {
  if (!client) {
    const apiKey = env.OPENAI_API_KEY
    if (!apiKey) throw new Error("OPENAI_API_KEY is not set")
    client = new OpenAI({ apiKey })
  }
  return client
}

/**
 * Get audio duration in seconds using ffprobe.
 */
export async function probeAudioDuration(filePath: string): Promise<number | null> {
  try {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v", "quiet",
      "-show_entries", "format=duration",
      "-of", "csv=p=0",
      filePath,
    ])
    const seconds = parseFloat(stdout.trim())
    return isNaN(seconds) ? null : Math.round(seconds)
  } catch {
    return null
  }
}

/**
 * Get audio duration as a FLOAT — no rounding. The timestamp-map offset
 * algorithm sums per-chunk durations, and `probeAudioDuration`'s
 * `Math.round` (kept for per-minute pricing) would compound to multi-second
 * error across a dozen chunks. This is the duration source the offset math
 * MUST use; do not swap in the rounded one.
 */
export async function probeAudioDurationPrecise(filePath: string): Promise<number | null> {
  try {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v", "quiet",
      "-show_entries", "format=duration",
      "-of", "csv=p=0",
      filePath,
    ])
    const seconds = parseFloat(stdout.trim())
    return Number.isFinite(seconds) ? seconds : null
  } catch {
    return null
  }
}

/**
 * Raw provider call — one model, one attempt, no telemetry. The File is
 * rebuilt from `buffer` on every call because the SDK consumes it as a
 * stream, so it can't be shared across the primary + fallback attempts.
 *
 * NO `prompt` is sent. Whisper's `prompt` is a SHORT vocabulary hint, but the
 * pipeline's only ever-available "hint" was the PREVIOUS chunk's transcript tail,
 * and feeding long verbatim text triggers a runaway decoding loop — rashid proved
 * it in isolation (the same audio that transcribed clean standalone looped 148×
 * once the tail was fed in). The tail→prompt channel is therefore removed entirely,
 * not just left dark: keeping the parameter wired made re-enabling that bug a
 * one-line change with no signature review. If a real vocabulary hint is ever
 * needed, add it back as an EXPLICIT short-hint parameter — never the transcript
 * tail. Accepted tradeoff: chunks transcribe INDEPENDENTLY, so a word/sentence
 * straddling a 10-min chunk boundary loses cross-chunk continuity; that is far
 * cheaper than a 148× hallucinated loop.
 */
async function rawTranscribe(
  openai: OpenAI,
  model: string,
  buffer: Buffer,
  filename: string,
  language: string,
): Promise<string> {
  const file = await toFile(buffer, filename)
  const response = await openai.audio.transcriptions.create({
    model,
    file,
    language,
  })
  return response.text
}

/**
 * Transcribe a single chunk, recording each provider call in `ai_runs`
 * with its ACTUAL model, and falling back to the cheaper model on a
 * TRANSIENT primary failure.
 *
 * No cross-chunk context is fed to whisper (see `rawTranscribe`) — the previous
 * chunk's transcript tail as `prompt` caused a runaway decoding loop, so that
 * channel is gone. The primary attempt is recorded (as failed) BEFORE the fallback
 * row opens, so the two rows never blur which model ran. The fallback is per-chunk:
 * a transient blip on one chunk doesn't downgrade the rest.
 */
async function transcribeChunk(
  openai: OpenAI,
  filePath: string,
  language: string,
  context?: TranscribeContext
): Promise<string> {
  const buffer = await fs.readFile(filePath)
  const filename = path.basename(filePath)
  // Probe once — feeds honest per-minute cost on whichever model runs.
  const durationSeconds = await probeAudioDuration(filePath)

  const attempt = (model: string): Promise<string> =>
    recordAiRun(
      {
        taskKind: "transcription",
        provider: "openai",
        modelName: model,
        eirId: context?.eirId ?? null,
        subjectTable: context?.subjectTable ?? null,
        subjectId: context?.subjectId ?? null,
        inputSnapshot: {
          // "text" vs the timestamp-map path's "timestamp_map" — lets one
          // session's two transcription calls be told apart in cost reports.
          phase: "text",
          filename,
          language,
          duration_seconds: durationSeconds,
        },
      },
      () => rawTranscribe(openai, model, buffer, filename, language),
      (text) => ({
        // Transcription bills per minute, not per token.
        tokensIn: null,
        tokensOut: null,
        costUsd: transcribeCost(model, durationSeconds),
        outputSnapshot: { chars: text.length },
      })
    )

  try {
    return await attempt(TRANSCRIBE_MODEL)
  } catch (err) {
    const { name } = classifyError(err)
    if (FALLBACK_ELIGIBLE_ERRORS.has(name)) {
      console.warn(
        `[whisper] ${TRANSCRIBE_MODEL} transient ${name} — ` +
          `falling back to ${FALLBACK_TRANSCRIBE_MODEL} for this chunk`
      )
      return await attempt(FALLBACK_TRANSCRIBE_MODEL)
    }
    throw err
  }
}

/**
 * Split audio into chunks using ffmpeg segment muxer.
 * Returns paths to chunk files.
 *
 * `segmentSeconds` defaults to the production 10-minute chunk; it is a
 * parameter only so the offset-integrity test can split a short fixture into
 * many small chunks (production callers never pass it).
 *
 * Exported so the offset algorithm — which depends entirely on the true
 * per-chunk durations these files carry — is directly testable.
 */
export async function splitIntoChunks(
  inputPath: string,
  chunksDir: string,
  ext: string,
  segmentSeconds: number = CHUNK_DURATION_SECONDS,
): Promise<string[]> {
  await fs.mkdir(chunksDir, { recursive: true })

  // Always transcode to MP3, audio-only (-map 0:a:0). Stream-copy (`-c copy`)
  // was fragile and broke on real uploads: a file named ".mp3" often carries
  // AAC audio (YouTube/yt-dlp downloads) or an embedded cover-art stream, and
  // the MP3 segment muxer then rejects it ("Exactly one MP3 audio stream is
  // required" / "Invalid audio stream"). Re-encoding with libmp3lame handles any
  // input container/codec, drops non-audio streams, and Whisper accepts the
  // resulting MP3 chunks — re-encode quality is irrelevant to ASR, and the
  // timestamp-offset math probes each chunk's ACTUAL duration so exact sizes
  // don't matter. `ext` is now unused for the codec decision (kept for the API).
  void ext
  const outputPattern = path.join(chunksDir, `chunk_%03d.mp3`)

  const args = [
    "-i", inputPath,
    "-map", "0:a:0",
    "-f", "segment",
    "-segment_time", String(segmentSeconds),
    "-c:a", "libmp3lame",
    "-q:a", "2",
    "-y", outputPattern,
  ]

  // 10-min cap: a 3h episode re-encodes in ~4 min; leave headroom for longer files.
  await execFileAsync("ffmpeg", args, { timeout: 600_000 })

  // Read chunk files sorted by name
  const files = await fs.readdir(chunksDir)
  return files
    .filter((f) => f.startsWith("chunk_"))
    .sort()
    .map((f) => path.join(chunksDir, f))
}

/**
 * Transcribe an audio file using OpenAI's transcription API
 * (gpt-4o-transcribe). If the file exceeds 24MB, it will be split into
 * chunks using ffmpeg.
 */
export async function transcribeAudioFile(
  filePath: string,
  language: string = "ar",
  context?: TranscribeContext
): Promise<TranscribeResult> {
  let openai: OpenAI
  try {
    openai = getClient()
  } catch {
    return { success: false, error: "OPENAI_API_KEY غير مُعدّ" }
  }

  try {
    const stat = await fs.stat(filePath)
    const ext = path.extname(filePath).toLowerCase()

    if (stat.size <= WHISPER_MAX_SIZE) {
      // Small file — send directly
      const text = await transcribeChunk(openai, filePath, language, context)
      return { success: true, text }
    }

    // Large file — split into chunks
    const chunksDir = path.join(path.dirname(filePath), "chunks")

    try {
      const chunkPaths = await splitIntoChunks(filePath, chunksDir, ext)

      if (chunkPaths.length === 0) {
        return { success: false, error: "فشل في تقسيم الملف الصوتي" }
      }

      // Transcribe chunks sequentially, each one INDEPENDENTLY. We deliberately
      // do NOT feed the previous chunk's transcript tail as whisper `prompt`:
      // whisper's `prompt` is for SHORT vocabulary hints, and passing long
      // verbatim text triggers a runaway decoding loop — rashid proved this in
      // isolation (the same audio that transcribes clean standalone looped 148×
      // inside the pipeline once the tail was fed in). That channel is now removed
      // from the call path entirely (see `rawTranscribe`).
      const texts: string[] = []
      for (const chunkPath of chunkPaths) {
        const text = await transcribeChunk(openai, chunkPath, language, context)
        texts.push(text)
      }

      return { success: true, text: texts.join(" ") }
    } finally {
      // Clean up chunks
      try {
        await fs.rm(chunksDir, { recursive: true, force: true })
      } catch {
        // ignore cleanup errors
      }
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : "فشل في تحويل الصوت إلى نص"
    return { success: false, error: msg }
  }
}

// ---------------------------------------------------------------------------
// Timestamped transcription (whisper-1 verbose_json) — the raw-audio time map
// foundation. Kept fully separate from the gpt-4o-transcribe TEXT path above.
// ---------------------------------------------------------------------------

export interface TimestampTranscription {
  success: boolean
  /** Absolute-timed segments on the full-episode timeline. */
  segments?: TimedSegment[]
  /** Precise full-file duration (float seconds) used for the offset math. */
  durationSeconds?: number | null
  error?: string
}

/** One progress tick fired by the chunk loop: "chunk X of Y transcribed". */
export interface TranscriptionProgressUpdate {
  /** Count of chunks fully transcribed so far (1-indexed after the first). */
  currentChunk: number
  /** Total chunks this transcription will process. */
  totalChunks: number
}

/**
 * Optional per-chunk progress callback. Purely observational — it must never
 * influence transcription, so `transcribeWithTimestamps` invokes it inside a
 * try/catch and ignores anything it throws.
 */
export type TranscriptionProgressFn = (update: TranscriptionProgressUpdate) => void

/**
 * Invoke a progress callback defensively: a buggy/throwing callback can NEVER
 * corrupt or abort the transcription loop. This is what makes the `onProgress`
 * parameter safely additive for every existing caller. Exported so this safety
 * boundary is unit-testable directly (same pattern as `splitIntoChunks`).
 */
export function emitTranscriptionProgress(
  fn: TranscriptionProgressFn | undefined,
  currentChunk: number,
  totalChunks: number,
): void {
  if (!fn) return
  try {
    fn({ currentChunk, totalChunks })
  } catch (err) {
    console.warn(
      `[whisper] onProgress callback threw (ignored): ${err instanceof Error ? err.message : String(err)}`,
    )
  }
}

/**
 * Raw provider call — whisper-1 `verbose_json`, one attempt, no telemetry.
 * Returns `{start, end, text, compressionRatio}` per segment; the SDK's
 * per-segment `tokens` array (huge, unused) is still dropped here so it never
 * reaches the DB. `compression_ratio` is ADDITIVE — the standard per-segment
 * repetition/hallucination signal the degeneracy guard reads as corroboration;
 * capturing it costs nothing (whisper already returns it) and breaks no caller.
 */
async function rawTranscribeVerbose(
  openai: OpenAI,
  buffer: Buffer,
  filename: string,
  language: string,
): Promise<RawSegment[]> {
  const file = await toFile(buffer, filename)
  const response = await openai.audio.transcriptions.create({
    model: TIMESTAMP_MODEL,
    file,
    language,
    response_format: "verbose_json",
    timestamp_granularities: ["segment"],
    temperature: 0,
    // No `prompt`: the tail→prompt channel is removed (see `rawTranscribe`) — it
    // is what turned this whisper-1 verbose path into a 148× decoding loop.
  })
  return (response.segments ?? []).map((s) => ({
    start: s.start,
    end: s.end,
    text: s.text,
    compressionRatio: s.compression_ratio,
  }))
}

/**
 * Transcribe one chunk with segment timestamps, recording the call in
 * `ai_runs` with `phase: "timestamp_map"` (vs the text path's "text"). Unlike
 * the text path there is NO cheaper fallback — the timestamp path is pinned to
 * whisper-1 (only it speaks `verbose_json`). `pricingDuration` is the precise
 * duration we already probed for the offset math, reused (rounded) for the
 * per-minute cost so we don't ffprobe the same chunk twice.
 */
async function transcribeChunkVerbose(
  openai: OpenAI,
  filePath: string,
  language: string,
  pricingDuration: number | null,
  context?: TranscribeContext,
  phase: string = "timestamp_map",
): Promise<RawSegment[]> {
  const buffer = await fs.readFile(filePath)
  const filename = path.basename(filePath)
  const roundedDuration = pricingDuration != null ? Math.round(pricingDuration) : null

  return recordAiRun(
    {
      taskKind: "transcription",
      provider: "openai",
      modelName: TIMESTAMP_MODEL,
      eirId: context?.eirId ?? null,
      subjectTable: context?.subjectTable ?? null,
      subjectId: context?.subjectId ?? null,
      inputSnapshot: {
        // "timestamp_map" (raw Phase-1 map, default) vs "review_transcription"
        // (Phase-2 edited-audio review) — lets a project's two whisper-1 passes
        // be attributed apart in cost reports. Both differ from the text path's
        // "text". Passed down from transcribeWithTimestamps.
        phase,
        filename,
        language,
        duration_seconds: roundedDuration,
      },
    },
    () => rawTranscribeVerbose(openai, buffer, filename, language),
    (segments) => ({
      tokensIn: null,
      tokensOut: null,
      costUsd: transcribeCost(TIMESTAMP_MODEL, roundedDuration),
      outputSnapshot: { segments: segments.length },
    }),
  )
}

/**
 * Build a SECOND-ACCURATE time map from an audio file with whisper-1 segment
 * timestamps. For files over 24MB it splits into chunks, probes each chunk's
 * TRUE duration, transcribes, and stitches with the cumulative-offset
 * algorithm (`buildTimedSegmentsFromWhisperChunks`) — whose self-checks THROW
 * on any inconsistency rather than return a wrong map.
 */
export async function transcribeWithTimestamps(
  filePath: string,
  language: string = "ar",
  context?: TranscribeContext,
  /**
   * ai_runs `inputSnapshot.phase` for THIS verbose transcription. Defaults to
   * "timestamp_map" (raw Phase-1 map, so existing callers are unchanged); the
   * Phase-2 review job passes "review_transcription" so the two whisper-1
   * passes on one project are attributable apart. The TEXT path is unaffected.
   */
  phase: string = "timestamp_map",
  /**
   * Optional per-chunk progress callback. Fires once per chunk fully
   * transcribed with `{ currentChunk, totalChunks }`. Default undefined ⇒ no-op,
   * so every existing caller (and the whole TEXT path) is byte-for-byte
   * unaffected. Observational only — see `emitTranscriptionProgress`.
   */
  onProgress?: TranscriptionProgressFn,
): Promise<TimestampTranscription> {
  let openai: OpenAI
  try {
    openai = getClient()
  } catch {
    return { success: false, error: "OPENAI_API_KEY غير مُعدّ" }
  }

  try {
    const fullDuration = await probeAudioDurationPrecise(filePath)
    if (fullDuration == null) {
      return { success: false, error: "تعذّر قياس مدة الملف الصوتي (ffprobe)" }
    }

    const stat = await fs.stat(filePath)
    const ext = path.extname(filePath).toLowerCase()

    // Small enough — the whole file is one chunk (offset 0).
    if (stat.size <= WHISPER_MAX_SIZE) {
      const segs = await transcribeChunkVerbose(
        openai, filePath, language, fullDuration, context, phase,
      )
      // Single-chunk path still reports 1/1 so a poller sees transcription done.
      emitTranscriptionProgress(onProgress, 1, 1)
      const segments = buildTimedSegmentsFromWhisperChunks(
        [{ segments: segs, durationSeconds: fullDuration }],
        fullDuration,
      )
      return { success: true, segments, durationSeconds: fullDuration }
    }

    // Large file — split, probe TRUE per-chunk durations, transcribe, offset.
    const chunksDir = path.join(path.dirname(filePath), "chunks-ts")
    try {
      const chunkPaths = await splitIntoChunks(filePath, chunksDir, ext)
      if (chunkPaths.length === 0) {
        return { success: false, error: "فشل في تقسيم الملف الصوتي" }
      }

      const chunks: WhisperChunk[] = []
      for (let i = 0; i < chunkPaths.length; i++) {
        const chunkPath = chunkPaths[i]
        const durationSeconds = await probeAudioDurationPrecise(chunkPath)
        const isLast = i === chunkPaths.length - 1

        // Drop a padding-only trailing chunk; a null duration ANYWHERE ELSE is
        // a genuine fault (corrupt/unreadable) and must not be silently mapped.
        if (durationSeconds == null || durationSeconds < MIN_CONTENT_CHUNK_SECONDS) {
          if (isLast) {
            console.warn(
              `[whisper] dropping spurious trailing chunk ` +
                `${path.basename(chunkPath)} (duration=${durationSeconds ?? "null"})`,
            )
            continue
          }
          return {
            success: false,
            error: `تعذّر قياس مدة المقطع: ${path.basename(chunkPath)}`,
          }
        }

        // Each chunk is transcribed INDEPENDENTLY — no cross-chunk `prompt`.
        // Feeding the previous chunk's transcript tail as whisper `prompt`
        // triggers a runaway decoding loop (see the loop note in the text path,
        // `transcribeAudioFile`); whisper's `prompt` is for short vocabulary
        // hints, not long verbatim text. That channel is removed (see
        // `rawTranscribe`).
        const segs = await transcribeChunkVerbose(
          openai, chunkPath, language, durationSeconds, context, phase,
        )
        chunks.push({ segments: segs, durationSeconds })
        // Report "chunk X of Y done" — X counts content chunks actually
        // transcribed (a dropped spurious tail is never counted), Y is the raw
        // split count. The transcription wall-clock dominates, so this is the
        // signal a progress bar rides on.
        emitTranscriptionProgress(onProgress, chunks.length, chunkPaths.length)
      }

      if (chunks.length === 0) {
        return { success: false, error: "لم تنتج المقاطع أي محتوى صالح" }
      }

      const segments = buildTimedSegmentsFromWhisperChunks(chunks, fullDuration)
      return { success: true, segments, durationSeconds: fullDuration }
    } finally {
      try {
        await fs.rm(chunksDir, { recursive: true, force: true })
      } catch {
        // ignore cleanup errors
      }
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : "فشل في إنشاء الخريطة الزمنية"
    return { success: false, error: msg }
  }
}
