/**
 * Server-side YouTube transcript extraction.
 *
 * Strategy cascade:
 *  1. yt-dlp subtitle extraction (fast, reliable — downloads VTT captions directly)
 *  2. Vercel proxy fallback (uses innertube API — currently broken as of March 2026)
 *
 * yt-dlp handles YouTube's anti-bot measures (JS challenges, impersonation)
 * which the innertube proxy can no longer bypass.
 */

import { execFile } from "child_process"
import { promisify } from "util"
import fs from "fs/promises"
import path from "path"

const execFileAsync = promisify(execFile)

const VERCEL_PROXY = "https://khat-yt-proxy.vercel.app/api/transcript"
const VIDEO_ID_REGEX = /^[A-Za-z0-9_-]{11}$/
const SUBTITLE_TIMEOUT_MS = 60_000 // 1 minute — subtitle download is fast

export interface ServerTranscriptResult {
  success: boolean
  text: string
  language: string
  error?: string
}

/**
 * Extract transcript from YouTube (server-side).
 * Tries yt-dlp subtitle extraction first, then Vercel proxy as fallback.
 */
export async function fetchTranscriptServer(
  videoId: string
): Promise<ServerTranscriptResult> {
  if (!VIDEO_ID_REGEX.test(videoId)) {
    return { success: false, text: "", language: "", error: "معرّف الفيديو غير صالح" }
  }

  // Strategy 1: yt-dlp subtitle extraction (preferred)
  const ytdlpResult = await fetchViaYtDlp(videoId)
  if (ytdlpResult.success && ytdlpResult.text) {
    return ytdlpResult
  }

  // Strategy 2: Vercel proxy fallback
  const proxyResult = await fetchViaVercelProxy(videoId)
  if (proxyResult.success && proxyResult.text) {
    return proxyResult
  }

  // Both failed — return the most useful error
  return {
    success: false,
    text: "",
    language: "",
    error: ytdlpResult.error || proxyResult.error || "فشل في استخراج النص من يوتيوب",
  }
}

// ---------------------------------------------------------------------------
// Strategy 1: yt-dlp subtitle extraction
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

// ---------------------------------------------------------------------------
// Strategy 2: Vercel proxy fallback (innertube API — currently unreliable)
// ---------------------------------------------------------------------------

interface CaptionTrack {
  baseUrl: string
  languageCode: string
  kind?: string
}

async function fetchViaVercelProxy(videoId: string): Promise<ServerTranscriptResult> {
  try {
    const tracksRes = await fetch(
      `${VERCEL_PROXY}?v=${encodeURIComponent(videoId)}&action=tracks`,
      { signal: AbortSignal.timeout(10_000) }
    )

    if (!tracksRes.ok) {
      return { success: false, text: "", language: "", error: `خطأ في الخادم الوسيط (${tracksRes.status})` }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tracksData: any = await tracksRes.json()
    const tracks: CaptionTrack[] = tracksData?.captionTracks || []

    if (tracks.length === 0) {
      return { success: false, text: "", language: "", error: "لا تتوفر ترجمة عبر الخادم الوسيط" }
    }

    const track = pickBestTrack(tracks)
    const captionUrl = track.baseUrl.includes("?")
      ? `${track.baseUrl}&fmt=json3`
      : `${track.baseUrl}?fmt=json3`

    const captionRes = await fetch(
      `${VERCEL_PROXY}?v=${videoId}&action=captions&url=${encodeURIComponent(captionUrl)}`,
      { signal: AbortSignal.timeout(10_000) }
    )

    if (!captionRes.ok) {
      return { success: false, text: "", language: track.languageCode, error: "فشل جلب النص" }
    }

    const captionText = await captionRes.text()
    let segments: string[] = []

    try {
      const captionData = JSON.parse(captionText)
      segments = parseJson3Captions(captionData)
    } catch {
      segments = parseCaptionXml(captionText)
    }

    if (segments.length === 0) {
      return { success: false, text: "", language: track.languageCode, error: "لا توجد نصوص" }
    }

    const cleaned = cleanSegments(segments)
    if (cleaned && cleaned.trim().length >= 10) {
      return { success: true, text: cleaned, language: track.languageCode }
    }

    return { success: false, text: "", language: track.languageCode, error: "النص المستخرج فارغ" }
  } catch {
    return { success: false, text: "", language: "", error: "فشل الاتصال بالخادم الوسيط" }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pickBestTrack(tracks: CaptionTrack[]): CaptionTrack {
  const arManual = tracks.find((t) => t.languageCode === "ar" && t.kind !== "asr")
  if (arManual) return arManual
  const arAuto = tracks.find((t) => t.languageCode === "ar")
  if (arAuto) return arAuto
  const anyManual = tracks.find((t) => t.kind !== "asr")
  if (anyManual) return anyManual
  return tracks[0]
}

function parseJson3Captions(
  data: { events?: { segs?: { utf8?: string }[] }[] }
): string[] {
  const segments: string[] = []
  if (!data.events) return segments
  for (const event of data.events) {
    if (!event.segs) continue
    const text = event.segs.map((s) => s.utf8 || "").join("").trim()
    if (text && text !== "\n") segments.push(text)
  }
  return segments
}

function parseCaptionXml(xml: string): string[] {
  const segments: string[] = []
  const textRegex = /<text[^>]*>([\s\S]*?)<\/text>/g
  let match
  while ((match = textRegex.exec(xml)) !== null) {
    const text = match[1]
      .replace(/<[^>]*>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim()
    if (text) segments.push(text)
  }
  return segments
}

function cleanSegments(segments: string[]): string {
  const seen = new Set<string>()
  const cleaned: string[] = []
  for (const segment of segments) {
    const text = segment.replace(/\[.*?\]/g, "").replace(/\(.*?\)/g, "").trim().replace(/\s+/g, " ")
    if (!text) continue
    const norm = text.replace(/[\u064B-\u0652]/g, "").replace(/[أإآ]/g, "ا").toLowerCase()
    if (seen.has(norm)) continue
    seen.add(norm)
    cleaned.push(text)
  }
  return cleaned.join(" ").replace(/\s+/g, " ").trim()
}
