/**
 * Deterministic silence / break detection for raw episode audio — NO AI.
 *
 * Khaled uploads the raw, unedited recording and wants a time map of where
 * the real content sits: "40:00–43:00 was a break". Silence is a mechanical
 * property of the waveform, so we measure it with ffmpeg's `silencedetect`
 * rather than asking a model — the answer is reproducible to the millisecond
 * and free.
 *
 * Two-pass approach (calibration measured by rashid on real episode audio):
 *   1. Peak first: `volumedetect` → `max_volume` (dBFS). Absolute thresholds
 *      break when the recording gain changes; an adaptive one does not.
 *   2. Adaptive threshold = clamp(peak − 12, −50, −30) dB. On real audio a
 *      −40dB threshold gave ~0.2ms error; −30dB produced 150+ false positives
 *      (natural inter-word dips). The −12dB-below-peak / −50..−30 clamp keeps
 *      the working point near −40dB across gain changes.
 *   3. One `silencedetect=noise=<thr>dB:d=0.8` pass; parse silence_start /
 *      silence_end.
 *   4. Classify by DURATION in code (not via ffmpeg params) — see below.
 *
 * NOTE: the calibration above was measured on ffmpeg 8.x (local). Production
 * (the droplet) runs ffmpeg 6.1.1; `silencedetect`/`volumedetect` exist there
 * but the exact working point should be re-confirmed on 6.1.1 before stage-1
 * is trusted in production.
 */

import { execFile } from "child_process"
import { promisify } from "util"

const execFileAsync = promisify(execFile)

/** Minimum silence (s) `silencedetect` must see before reporting a gap. */
export const MIN_SILENCE_SECONDS = 0.8

/**
 * Duration bands (seconds) that split a raw silence into a class:
 *   < 2.0s        → "pause"           (hidden — normal speech rhythm)
 *   2.0s – 20s    → "long_pause"      (feeds edit-suggestions later)
 *   > 20s         → "break_candidate" (surfaced to Khaled)
 * Khaled's real break (40→43min ≈ 180s) sits far above the 20s line, so the
 * boundaries never have to adjudicate his actual breaks.
 */
export const PAUSE_MAX_SECONDS = 2.0
export const BREAK_MIN_SECONDS = 20.0

export type SilenceClass = "pause" | "long_pause" | "break_candidate"

/** A raw silence interval (absolute episode seconds). */
export interface SilenceInterval {
  start: number
  end: number
  durationSeconds: number
}

/** A classified silence interval. */
export interface ClassifiedSilence extends SilenceInterval {
  kind: SilenceClass
}

/**
 * Probe the peak volume (`max_volume`, dBFS) of an audio file via ffmpeg's
 * `volumedetect`. Returns null if it can't be read. 0 dBFS is full-scale;
 * real recordings peak negative (e.g. −16 dBFS).
 */
export async function probePeakDb(filePath: string): Promise<number | null> {
  try {
    // volumedetect writes to stderr; a null muxer means no output file.
    const { stderr } = await execFileAsync(
      "ffmpeg",
      ["-hide_banner", "-i", filePath, "-af", "volumedetect", "-f", "null", "-"],
      { timeout: 300_000, maxBuffer: 10 * 1024 * 1024 },
    )
    const m = stderr.match(/max_volume:\s*(-?\d+(?:\.\d+)?)\s*dB/)
    if (!m) return null
    const peak = parseFloat(m[1])
    return Number.isFinite(peak) ? peak : null
  } catch {
    return null
  }
}

/**
 * Adaptive silence threshold in dB from a measured peak: `clamp(peak − 12,
 * −50, −30)`. Pure + exported so it is unit-testable without touching ffmpeg.
 */
export function adaptiveThresholdDb(peakDb: number): number {
  const raw = peakDb - 12
  if (raw < -50) return -50
  if (raw > -30) return -30
  return raw
}

/** Classify a silence duration into pause / long_pause / break_candidate. */
export function classifySilenceDuration(durationSeconds: number): SilenceClass {
  if (durationSeconds < PAUSE_MAX_SECONDS) return "pause"
  if (durationSeconds <= BREAK_MIN_SECONDS) return "long_pause"
  return "break_candidate"
}

/**
 * Run ONE `silencedetect` pass at an explicit threshold and parse the raw
 * silence intervals. Exposed with explicit params so tests can pin the
 * threshold (e.g. the −40dB/d=0.8 ground-truth check) independent of the
 * adaptive calibration.
 */
export async function runSilenceDetect(
  filePath: string,
  opts: { thresholdDb: number; minSilenceSeconds?: number },
): Promise<SilenceInterval[]> {
  const minSilence = opts.minSilenceSeconds ?? MIN_SILENCE_SECONDS
  const { stderr } = await execFileAsync(
    "ffmpeg",
    [
      "-hide_banner",
      "-i",
      filePath,
      "-af",
      `silencedetect=noise=${opts.thresholdDb}dB:d=${minSilence}`,
      "-f",
      "null",
      "-",
    ],
    { timeout: 300_000, maxBuffer: 10 * 1024 * 1024 },
  )
  return parseSilenceDetect(stderr)
}

/**
 * Parse ffmpeg `silencedetect` stderr into intervals. `silencedetect` emits
 * `silence_start: <s>` then `silence_end: <s> | silence_duration: <s>`. A
 * trailing `silence_start` with no matching end (silence running to EOF) is
 * closed out with its reported duration if present, else dropped.
 */
export function parseSilenceDetect(stderr: string): SilenceInterval[] {
  const intervals: SilenceInterval[] = []
  let pendingStart: number | null = null

  const startRe = /silence_start:\s*(-?\d+(?:\.\d+)?)/
  const endRe = /silence_end:\s*(-?\d+(?:\.\d+)?)(?:\s*\|\s*silence_duration:\s*(-?\d+(?:\.\d+)?))?/

  for (const line of stderr.split("\n")) {
    const endMatch = line.match(endRe)
    if (endMatch) {
      const end = parseFloat(endMatch[1])
      if (pendingStart != null && Number.isFinite(end)) {
        const start = pendingStart
        const durationSeconds =
          endMatch[2] != null ? parseFloat(endMatch[2]) : end - start
        intervals.push({ start, end, durationSeconds })
        pendingStart = null
      }
      continue
    }
    const startMatch = line.match(startRe)
    if (startMatch) {
      const start = parseFloat(startMatch[1])
      if (Number.isFinite(start)) pendingStart = start
    }
  }

  return intervals
}

export interface DetectBreaksResult {
  /** The peak (dBFS) volumedetect measured, or null if unreadable. */
  peakDb: number | null
  /** The adaptive threshold (dB) actually used for detection. */
  thresholdDb: number
  /** Every classified silence interval (pauses included). */
  silences: ClassifiedSilence[]
  /** Just the break candidates (>20s) — what Khaled sees. */
  breaks: ClassifiedSilence[]
}

/**
 * Full deterministic break detection: peak → adaptive threshold → one
 * silencedetect pass → classify. If the peak can't be probed, falls back to a
 * fixed −40 dB (the calibrated centre of the clamp) so detection still runs.
 */
export async function detectBreaks(filePath: string): Promise<DetectBreaksResult> {
  const peakDb = await probePeakDb(filePath)
  const thresholdDb = peakDb != null ? adaptiveThresholdDb(peakDb) : -40
  const raw = await runSilenceDetect(filePath, { thresholdDb })
  const silences: ClassifiedSilence[] = raw.map((s) => ({
    ...s,
    kind: classifySilenceDuration(s.durationSeconds),
  }))
  return {
    peakDb,
    thresholdDb,
    silences,
    breaks: silences.filter((s) => s.kind === "break_candidate"),
  }
}
