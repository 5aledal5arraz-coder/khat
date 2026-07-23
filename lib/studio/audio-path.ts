import path from "path"
import fs from "fs/promises"

/**
 * Single source of truth for where uploaded Studio audio lives on disk.
 *
 * The uploader (`app/api/admin/studio/upload/route.ts`) writes EVERY file as
 *   data/studio-audio/{sessionId}/audio-{sessionId}{ext}
 * where `{ext}` is derived from the ORIGINAL upload filename — the file is NOT
 * stored under that original name. `studio_sessions.audio_filename` keeps the
 * original browser filename (for display) and is therefore ONLY good for its
 * extension. Joining `audio_filename` directly onto the session dir was the
 * ENOENT bug this module exists to kill: the correct convention had been
 * hand-copied into some call sites and mis-typed in others. Every consumer now
 * derives the path here so there is exactly one place that knows the layout.
 */
export const AUDIO_DIR = path.join(process.cwd(), "data", "studio-audio")

/**
 * Build the on-disk audio path for a session WITHOUT touching the filesystem.
 * Derives only the EXTENSION from `audioFilename` (never its basename) and
 * confirms the result stays inside the session directory (defence against a
 * crafted session id / extension). Throws on a path escape.
 */
export function buildSessionAudioPath(
  sessionId: string,
  audioFilename: string,
): string {
  const ext = path.extname(audioFilename).toLowerCase()
  const sessionDir = path.join(AUDIO_DIR, sessionId)
  const filePath = path.join(sessionDir, `audio-${sessionId}${ext}`)
  if (!path.resolve(filePath).startsWith(path.resolve(sessionDir) + path.sep)) {
    throw new Error(
      "studio-audio: resolved audio path escapes the session directory",
    )
  }
  return filePath
}

/**
 * Build the path AND confirm the file is on disk. Throws (ENOENT) when the
 * audio isn't there, so callers surface a clear "audio missing" failure instead
 * of feeding a non-existent path to whisper/ffmpeg.
 */
export async function resolveSessionAudioPath(
  sessionId: string,
  audioFilename: string,
): Promise<string> {
  const filePath = buildSessionAudioPath(sessionId, audioFilename)
  await fs.access(filePath) // throws if the audio isn't on disk
  return filePath
}
