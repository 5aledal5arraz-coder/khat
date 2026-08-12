import { execFile } from "child_process"
import { promisify } from "util"
import { mkdir, writeFile, unlink } from "fs/promises"
import { tmpdir } from "os"
import path from "path"
import crypto from "crypto"

const execFileAsync = promisify(execFile)

export const TESTIMONIAL_AUDIO_DIR = path.join(
  process.cwd(),
  "public",
  "testimonials",
)

/**
 * TRANSCODE, ALWAYS — never store what was uploaded.
 *
 * The likeliest file here is a WhatsApp voice note the guest sent after the
 * recording. WhatsApp encodes those as **Opus in an Ogg container**, and
 * Safari on iOS does not play Ogg. Storing the upload untouched would produce
 * a player that works on the laptop it was tested on and is silent on most of
 * this audience's phones — a failure nothing in the admin would report,
 * because nothing would have failed.
 *
 * AAC in an MP4 container (`.m4a`) is the one audio format every current
 * browser plays, iOS Safari included, so everything is re-encoded to it.
 * ffmpeg and ffprobe are already runtime dependencies of the Studio transcript
 * pipeline (`lib/youtube/download.ts` checks for both at boot), so this adds
 * no new binary to the deployment.
 */
const TRANSCODE_TIMEOUT_MS = 60_000

/** Voice, not music: mono at 24kHz/64kbps is transparent for speech and small. */
const AAC_BITRATE = "64k"
const SAMPLE_RATE = "24000"

export interface TranscodedAudio {
  /** Public path, e.g. `/testimonials/a1b2c3d4e5f60718.m4a`. */
  url: string
  /** Whole seconds, measured from the OUTPUT file. */
  durationSeconds: number | null
}

/**
 * Probe the encoded file. Nullable on purpose and never guessed — the player
 * reads the real duration from the audio element once metadata loads, so a
 * missing value costs a progress bar before first play, while a fabricated one
 * would be wrong forever.
 */
async function probeDuration(filePath: string): Promise<number | null> {
  try {
    const { stdout } = await execFileAsync(
      "ffprobe",
      [
        "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        filePath,
      ],
      { timeout: 15_000 },
    )
    const seconds = parseFloat(stdout.trim())
    if (!Number.isFinite(seconds) || seconds <= 0) return null
    return Math.round(seconds)
  } catch {
    return null
  }
}

/**
 * Write `buffer` to a temp file, re-encode it to `.m4a` under
 * `public/testimonials/`, and return the public path plus its duration.
 *
 * Throws on an ffmpeg failure — the caller turns that into a 4xx/5xx. It does
 * NOT fall back to storing the original bytes: a stored Ogg is exactly the
 * silent-on-iPhone outcome this function exists to prevent.
 */
export async function transcodeTestimonialAudio(
  buffer: Buffer,
  container: string,
): Promise<TranscodedAudio> {
  const hash = crypto.randomBytes(8).toString("hex")
  // The input extension is only a hint for ffmpeg's demuxer probe; it decides
  // by content regardless, which is why a mislabelled `.opus` is safe here.
  const inputPath = path.join(tmpdir(), `khat-testimonial-${hash}.${container}`)
  const filename = `${hash}.m4a`
  const outputPath = path.join(TESTIMONIAL_AUDIO_DIR, filename)

  await mkdir(TESTIMONIAL_AUDIO_DIR, { recursive: true })
  await writeFile(inputPath, buffer)

  try {
    await execFileAsync(
      "ffmpeg",
      [
        "-nostdin",
        "-y",
        "-i", inputPath,
        // Drop any video stream. A "voice note" exported from some phones
        // carries an album-art frame, which would otherwise make the output an
        // mp4 the <audio> element refuses to treat as audio.
        "-vn",
        "-map", "a:0",
        "-c:a", "aac",
        "-b:a", AAC_BITRATE,
        "-ac", "1",
        "-ar", SAMPLE_RATE,
        // Metadata travels with a shared voice note — the sender's phone, the
        // app, sometimes a title. Strip it: this file is served publicly.
        "-map_metadata", "-1",
        // Puts the MP4 index at the front so the player can start before the
        // whole file arrives.
        "-movflags", "+faststart",
        outputPath,
      ],
      { timeout: TRANSCODE_TIMEOUT_MS, maxBuffer: 10 * 1024 * 1024 },
    )
  } catch (err) {
    // Leave nothing half-written behind for the media route to serve.
    await unlink(outputPath).catch(() => {})
    throw err
  } finally {
    await unlink(inputPath).catch(() => {})
  }

  const durationSeconds = await probeDuration(outputPath)

  return { url: `/testimonials/${filename}`, durationSeconds }
}

/**
 * Delete a stored voice note. Best-effort by design: the DB row is the source
 * of truth for whether a testimonial has audio, and an orphaned file costs
 * ~200 KB while a delete that throws would block the operator from clearing
 * the field.
 */
export async function deleteTestimonialAudio(url: string | null): Promise<void> {
  if (!url) return
  const filename = path.basename(url)
  if (!/^[a-f0-9]{16}\.m4a$/.test(filename)) return
  await unlink(path.join(TESTIMONIAL_AUDIO_DIR, filename)).catch(() => {})
}
