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
  /**
   * ص-٦ — where the caption track came from. `-orig` used to be stripped
   * off the language and the distinction thrown away, so nothing
   * downstream could tell a human-written track from a machine one. That
   * matters twice: manual tracks read better, auto tracks are the ones
   * that carry word-level timing tags.
   */
  track?: "manual" | "auto" | "unknown"
  /** True when the VTT carries `-->` cue timings (ص-٥ can use it). */
  hasCues?: boolean
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

    // Find the downloaded subtitle file. ص-٦ — when yt-dlp lands BOTH a
    // plain `.ar.vtt` and an auto-generated `.ar-orig.vtt`, `find` used to
    // return whichever the filesystem listed first. Prefer the
    // human-written track deterministically.
    const files = await fs.readdir(tempDir)
    const vttFiles = files.filter((f) => f.endsWith(".vtt"))
    const manualFile = vttFiles.find((f) => !/-orig\.vtt$/i.test(f))
    const vttFile = manualFile ?? vttFiles[0]

    if (!vttFile) {
      return { success: false, text: "", language: "", error: "لم يتم العثور على ترجمة عربية" }
    }

    const vttContent = await fs.readFile(path.join(tempDir, vttFile), "utf-8")

    if (!vttContent || vttContent.trim().length < 20) {
      return { success: false, text: "", language: "ar", error: "ملف الترجمة فارغ" }
    }

    // Detect language from filename (e.g., "ZPeBeS87EeI.ar.vtt" or "ZPeBeS87EeI.ar-orig.vtt")
    const langMatch = vttFile.match(/\.([a-z]{2}(?:-[a-z]+)?)\.vtt$/i)
    const rawLang = langMatch ? langMatch[1] : "ar"
    const language = rawLang.replace("-orig", "")

    // Auto-generated YouTube captions declare themselves in the header
    // (`Kind: captions`) and carry inline word-level timing tags; the
    // `-orig` suffix is yt-dlp's own marker for the auto track. Any one of
    // those is enough to call it machine-made.
    const isAuto =
      /-orig$/i.test(rawLang) || /<\d{2}:\d{2}:\d{2}\.\d{3}>/.test(vttContent)
    const track: ServerTranscriptResult["track"] = isAuto
      ? "auto"
      : manualFile
        ? "manual"
        : "unknown"

    return {
      success: true,
      text: vttContent,
      language,
      track,
      hasCues: vttContent.includes("-->"),
    }
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
