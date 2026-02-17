import { execFile } from "child_process"
import { promisify } from "util"
import fs from "fs/promises"
import path from "path"

const execFileAsync = promisify(execFile)

/** Strict YouTube video ID pattern: exactly 11 chars of [A-Za-z0-9_-] */
const VIDEO_ID_REGEX = /^[A-Za-z0-9_-]{11}$/

interface DownloadResult {
  filePath: string
  cleanup: () => Promise<void>
}

/**
 * Download audio from a YouTube video using yt-dlp.
 *
 * Returns the path to the downloaded MP3 file and a cleanup function
 * that removes the temp file when you're done with it.
 *
 * Requires: `brew install yt-dlp ffmpeg`
 */
export async function downloadYouTubeAudio(
  videoId: string,
  outputDir: string
): Promise<DownloadResult> {
  // Validate video ID to prevent command injection
  if (!VIDEO_ID_REGEX.test(videoId)) {
    throw new Error("معرّف الفيديو غير صالح")
  }

  await fs.mkdir(outputDir, { recursive: true })

  const outputPath = path.join(outputDir, `${videoId}.mp3`)

  // Download audio-only, convert to MP3 with moderate quality (smaller file)
  // -f bestaudio: pick best audio stream
  // -x: extract audio
  // --audio-format mp3: convert to MP3
  // --audio-quality 5: ~130kbps (good enough for speech, keeps file small)
  // --no-playlist: never expand to playlist
  await execFileAsync(
    "yt-dlp",
    [
      "-f", "bestaudio",
      "-x",
      "--audio-format", "mp3",
      "--audio-quality", "5",
      "--no-playlist",
      "-o", outputPath,
      "--", videoId,
    ],
    { timeout: 300_000 } // 5 min timeout for download
  )

  // Verify the file exists
  await fs.access(outputPath)

  return {
    filePath: outputPath,
    cleanup: async () => {
      try {
        await fs.unlink(outputPath)
      } catch {
        // ignore cleanup errors
      }
    },
  }
}
