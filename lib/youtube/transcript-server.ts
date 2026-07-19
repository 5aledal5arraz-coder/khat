/**
 * Server-side YouTube transcript extraction via yt-dlp.
 *
 * Downloads YouTube's VTT captions directly with yt-dlp, which handles
 * YouTube's anti-bot measures (JS challenges, impersonation) that the old
 * innertube proxy could no longer bypass.
 *
 * NOTE: the returned text is RAW VTT (WEBVTT header + timestamps). Callers that
 * persist through createTranscript() get cleaning for free; any other caller
 * must run it through cleanTranscriptText() (lib/studio/utils) first.
 */

import { execFile } from "child_process"
import { promisify } from "util"
import fs from "fs/promises"
import path from "path"

const execFileAsync = promisify(execFile)

const VIDEO_ID_REGEX = /^[A-Za-z0-9_-]{11}$/
const SUBTITLE_TIMEOUT_MS = 60_000 // 1 minute — subtitle download is fast

export interface ServerTranscriptResult {
  success: boolean
  text: string
  language: string
  error?: string
}

/**
 * Extract transcript from YouTube (server-side) via yt-dlp subtitle extraction.
 * Returns RAW VTT text — clean with cleanTranscriptText() before use unless
 * persisting through createTranscript() (which cleans automatically).
 */
export async function fetchTranscriptServer(
  videoId: string
): Promise<ServerTranscriptResult> {
  if (!VIDEO_ID_REGEX.test(videoId)) {
    return { success: false, text: "", language: "", error: "معرّف الفيديو غير صالح" }
  }

  const ytdlpResult = await fetchViaYtDlp(videoId)
  if (ytdlpResult.success && ytdlpResult.text) {
    return ytdlpResult
  }

  return {
    success: false,
    text: "",
    language: "",
    error: ytdlpResult.error || "فشل في استخراج النص من يوتيوب",
  }
}

// ---------------------------------------------------------------------------
// yt-dlp subtitle extraction
// ---------------------------------------------------------------------------

/** Cache the resolved yt-dlp binary path */
let ytDlpBin: string | null = null

async function resolveYtDlp(): Promise<string> {
  if (ytDlpBin) return ytDlpBin

  const candidates = [
    "yt-dlp",
    "/usr/local/bin/yt-dlp",
    "/opt/homebrew/bin/yt-dlp",
  ]

  for (const bin of candidates) {
    try {
      await execFileAsync(bin, ["--version"], { timeout: 5_000 })
      ytDlpBin = bin
      return bin
    } catch {
      // try next
    }
  }

  throw new Error("yt-dlp غير مثبّت")
}

async function fetchViaYtDlp(videoId: string): Promise<ServerTranscriptResult> {
  let bin: string
  try {
    bin = await resolveYtDlp()
  } catch {
    return { success: false, text: "", language: "", error: "yt-dlp غير مثبّت — لا يمكن استخراج النص" }
  }

  const tempDir = path.join(process.cwd(), "data", "subtitle-temp", videoId)

  try {
    await fs.mkdir(tempDir, { recursive: true })

    const outputTemplate = path.join(tempDir, "%(id)s")

    // Try Arabic subtitles first (manual, then auto-generated)
    // --write-sub: manual subs, --write-auto-sub: auto-generated
    // --sub-lang: ar (Arabic), ar-orig (Arabic original for auto-generated)
    // --skip-download: don't download video/audio
    const args = [
      "--write-auto-sub",
      "--write-sub",
      "--sub-lang", "ar,ar-orig",
      "--sub-format", "vtt",
      "--skip-download",
      "--no-playlist",
      "--no-warnings",
      "-o", outputTemplate,
      "--", videoId,
    ]

    await execFileAsync(bin, args, {
      timeout: SUBTITLE_TIMEOUT_MS,
      maxBuffer: 10 * 1024 * 1024,
      env: { ...process.env, PATH: `${process.env.PATH}:/usr/local/bin:/opt/homebrew/bin` },
    })

    // Find the downloaded subtitle file
    const files = await fs.readdir(tempDir)
    const vttFile = files.find(f => f.endsWith(".vtt"))

    if (!vttFile) {
      return { success: false, text: "", language: "", error: "لم يتم العثور على ترجمة عربية" }
    }

    const vttContent = await fs.readFile(path.join(tempDir, vttFile), "utf-8")

    if (!vttContent || vttContent.trim().length < 20) {
      return { success: false, text: "", language: "ar", error: "ملف الترجمة فارغ" }
    }

    // Detect language from filename (e.g., "ZPeBeS87EeI.ar.vtt" or "ZPeBeS87EeI.ar-orig.vtt")
    const langMatch = vttFile.match(/\.([a-z]{2}(?:-[a-z]+)?)\.vtt$/i)
    const language = langMatch ? langMatch[1].replace("-orig", "") : "ar"

    return { success: true, text: vttContent, language }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    // Don't log full error — it's expected when yt-dlp isn't available
    console.warn(`[transcript-server] yt-dlp subtitle extraction failed for ${videoId}: ${msg.slice(0, 200)}`)
    return { success: false, text: "", language: "", error: `فشل استخراج الترجمة: ${msg.slice(0, 100)}` }
  } finally {
    // Clean up temp directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true })
    } catch {
      // ignore cleanup errors
    }
  }
}
