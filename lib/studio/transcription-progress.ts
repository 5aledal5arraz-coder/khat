/**
 * Studio 3-phase journey — transcription progress derivation (PURE).
 *
 * The long Studio jobs (episode_map = Phase 1, episode_review = Phase 2) are
 * transcription-dominated: whisper on a ~2h recording is the overwhelming
 * majority of the wall time; the ffmpeg break-detection + AI analysis (map) or
 * the pure verdict (review) are a fast tail. These pure functions turn "chunk X
 * of Y, at which stage" into the (fraction, etaSeconds) a DETERMINATE progress
 * bar rides on. Extracted + exported so every derivation is unit-tested with no
 * DB, no whisper, and no wall clock.
 *
 * Split of responsibility: the SERVER (handler) owns the semantic progress
 * (stage / chunks / fraction / a per-chunk-rate etaSeconds snapshot); the CLIENT
 * owns the smooth second-by-second countdown of that etaSeconds using its own
 * wall clock (immune to server↔client skew). See TranscriptionProgressBar.
 */

/** Must match whisper.ts CHUNK_DURATION_SECONDS — the estimate depends on it. */
export const TRANSCRIBE_CHUNK_SECONDS = 600

export type TranscriptionStage =
  | "transcribing"
  | "detecting_breaks" // map only  (ffmpeg silencedetect)
  | "analyzing" // map only  (the single AI map call)
  | "comparing" // review only (the pure verdict)
  | "done"

/**
 * The shape stored on `jobs.progress` and returned by the status endpoints.
 * A `type` (not an interface) on purpose: type aliases of object literals get an
 * implicit index signature, so this is assignable to the generic
 * `Record<string, unknown>` that `ctx.reportProgress` / `jobs.progress` take —
 * no cast at the call sites.
 */
export type TranscriptionProgress = {
  stage: TranscriptionStage
  /** Chunks fully transcribed so far (0 before the first completes). */
  currentChunk: number
  /** Total chunks the transcription will process (0 = not yet known). */
  totalChunks: number
  /** Overall completion 0..1 (transcription-weighted). */
  fraction: number
  /**
   * Seconds of transcription remaining as measured at the last chunk boundary
   * (per-chunk rate × chunks left). null = "not computable yet" → the UI shows
   * «يُحسب…» until the first chunk lands, and for the fast post-transcription
   * stages (where the label, not a number, carries "almost done").
   */
  etaSeconds: number | null
}

/**
 * Fraction of overall wall time transcription owns (~90%). The remaining 10% is
 * split across the fast post-transcription stage(s). Weighting the ~1-min
 * analysis equal to a ~50-min transcription would make the bar lie, so we don't.
 */
export const TRANSCRIBE_WEIGHT = 0.9

/**
 * Where the bar sits when each post-transcription stage BEGINS (between
 * TRANSCRIBE_WEIGHT and 1.0). Coarse by design: the tail is seconds-to-a-minute,
 * so precise sub-fractions there are pointless — the stage LABEL is the signal.
 */
const STAGE_FRACTION: Record<Exclude<TranscriptionStage, "transcribing">, number> = {
  detecting_breaks: 0.9,
  comparing: 0.9,
  analyzing: 0.96,
  done: 1,
}

/**
 * Total chunks from the audio duration: `ceil(duration / 10min)`. Known at
 * upload (duration_seconds is stored on the session), so the handler can show a
 * determinate scale ("chunk 0 of ~15") the instant the job starts — before
 * whisper has even split the file. Returns 0 when the duration is unknown, which
 * the UI renders as an indeterminate total until whisper reports the real count.
 */
export function estimateChunkCount(durationSeconds: number | null | undefined): number {
  if (durationSeconds == null || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return 0
  }
  return Math.max(1, Math.ceil(durationSeconds / TRANSCRIBE_CHUNK_SECONDS))
}

/** Overall 0..1 completion for a (stage, chunk-ratio). */
export function computeProgressFraction(
  stage: TranscriptionStage,
  currentChunk: number,
  totalChunks: number,
): number {
  if (stage === "transcribing") {
    if (totalChunks <= 0) return 0
    const ratio = Math.min(1, Math.max(0, currentChunk / totalChunks))
    return TRANSCRIBE_WEIGHT * ratio
  }
  return STAGE_FRACTION[stage]
}

/**
 * Transcription seconds remaining = measured per-chunk rate × chunks left.
 * This is the "elapsed-per-chunk × remaining" estimate, refined every chunk.
 * Returns null (→ «يُحسب…») until the first chunk completes — never a jumpy
 * fabricated number from t=0.
 */
export function computeEtaSeconds(
  elapsedMs: number,
  currentChunk: number,
  totalChunks: number,
): number | null {
  if (currentChunk < 1 || totalChunks <= 0 || elapsedMs <= 0) return null
  const remaining = Math.max(0, totalChunks - currentChunk)
  if (remaining === 0) return 0
  const perChunkMs = elapsedMs / currentChunk
  return Math.round((perChunkMs * remaining) / 1000)
}

/**
 * Assemble the progress record the handler stores. `elapsedMs` (transcription
 * wall time so far) feeds the ETA and is only meaningful during "transcribing";
 * the post-transcription stages carry a null ETA (the label says "almost done").
 */
export function buildTranscriptionProgress(args: {
  stage: TranscriptionStage
  currentChunk: number
  totalChunks: number
  elapsedMs?: number
}): TranscriptionProgress {
  const { stage, currentChunk, totalChunks, elapsedMs } = args
  return {
    stage,
    currentChunk,
    totalChunks,
    fraction: computeProgressFraction(stage, currentChunk, totalChunks),
    etaSeconds:
      stage === "transcribing" && elapsedMs != null
        ? computeEtaSeconds(elapsedMs, currentChunk, totalChunks)
        : null,
  }
}
