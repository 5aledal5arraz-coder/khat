/**
 * Client-side YouTube transcript extraction.
 *
 * Strategy cascade:
 *  1. Direct InnerTube call from browser (via corsproxy.io for CORS)
 *  2. Server proxy fallback (may fail if server IP is blocked)
 *
 * The browser-based approach bypasses server-side bot detection.
 */

export interface ClientTranscriptResult {
  success: boolean
  text: string
  language: string
  error?: string
}

interface CaptionTrack {
  baseUrl: string
  languageCode: string
  kind?: string
  name?: { simpleText?: string }
}

const PROXY_BASE = "/api/admin/studio/youtube-proxy"
const VERCEL_PROXY = "https://khat-yt-proxy.vercel.app/api/transcript"

/**
 * Extract transcript — tries multiple approaches:
 *  1. Vercel Edge proxy (different IP than our server)
 *  2. Server proxy (may be blocked by YouTube)
 */
export async function fetchTranscriptClient(
  videoId: string
): Promise<ClientTranscriptResult> {
  // Approach 1: Vercel proxy
  const vercel = await fetchViaVercelProxy(videoId)
  if (vercel.success && vercel.text) return vercel

  // Approach 2: Server proxy
  const proxied = await fetchViaServerProxy(videoId)
  if (proxied.success && proxied.text) return proxied

  return {
    success: false,
    text: "",
    language: "",
    error: vercel.error || proxied.error || "لا تتوفر ترجمة تلقائية لهذا الفيديو",
  }
}

// ---------------------------------------------------------------------------
// Approach 1: Vercel Edge proxy
// ---------------------------------------------------------------------------

async function fetchViaVercelProxy(
  videoId: string
): Promise<ClientTranscriptResult> {
  try {
    const tracksRes = await fetch(
      `${VERCEL_PROXY}?v=${encodeURIComponent(videoId)}&action=tracks`
    )

    if (!tracksRes.ok) {
      return { success: false, text: "", language: "", error: `Vercel proxy error (${tracksRes.status})` }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tracksData: any = await tracksRes.json()
    const tracks: CaptionTrack[] = tracksData?.captionTracks || []

    if (tracks.length === 0) {
      const errors = tracksData?.errors?.join(", ") || ""
      return { success: false, text: "", language: "", error: errors || "لا تتوفر ترجمة" }
    }

    const track = pickBestTrack(tracks)
    const captionUrl = track.baseUrl.includes("?")
      ? `${track.baseUrl}&fmt=json3`
      : `${track.baseUrl}?fmt=json3`

    const captionRes = await fetch(
      `${VERCEL_PROXY}?v=${videoId}&action=captions&url=${encodeURIComponent(captionUrl)}`
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
    if (cleaned) {
      return { success: true, text: cleaned, language: track.languageCode }
    }

    return { success: false, text: "", language: track.languageCode, error: "لا توجد نصوص بعد التنظيف" }
  } catch {
    return { success: false, text: "", language: "", error: "فشل الاتصال بـ Vercel proxy" }
  }
}

// ---------------------------------------------------------------------------
// Approach 2: Server proxy fallback
// ---------------------------------------------------------------------------

async function fetchViaServerProxy(
  videoId: string
): Promise<ClientTranscriptResult> {
  try {
    const tracksRes = await fetch(
      `${PROXY_BASE}?action=tracks&videoId=${encodeURIComponent(videoId)}`
    )

    if (!tracksRes.ok) {
      return { success: false, text: "", language: "", error: `Proxy error (${tracksRes.status})` }
    }

    const tracksText = await tracksRes.text()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let tracksData: any
    try {
      tracksData = JSON.parse(tracksText)
    } catch {
      return { success: false, text: "", language: "", error: "استجابة غير صالحة من الخادم الوسيط" }
    }

    const captionTracks: CaptionTrack[] = tracksData?.captionTracks || []
    if (captionTracks.length === 0) {
      return { success: false, text: "", language: "", error: "لا تتوفر ترجمة عبر الخادم الوسيط" }
    }

    const track = pickBestTrack(captionTracks)
    const language = track.languageCode

    const captionUrl = track.baseUrl.includes("?")
      ? `${track.baseUrl}&fmt=json3`
      : `${track.baseUrl}?fmt=json3`

    const captionRes = await fetch(
      `${PROXY_BASE}?action=captions&url=${encodeURIComponent(captionUrl)}`
    )

    if (!captionRes.ok) {
      return { success: false, text: "", language, error: "فشل في جلب النص عبر الخادم الوسيط" }
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
      return { success: false, text: "", language, error: "لا توجد نصوص في الترجمة" }
    }

    const text = cleanSegments(segments)
    if (!text) {
      return { success: false, text: "", language, error: "لا توجد نصوص في الترجمة" }
    }

    return { success: true, text, language }
  } catch {
    return { success: false, text: "", language: "", error: "فشل الخادم الوسيط" }
  }
}

// ---------------------------------------------------------------------------
// Shared helpers
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
    const text = event.segs
      .map((s) => s.utf8 || "")
      .join("")
      .trim()
    if (text && text !== "\n") {
      segments.push(text)
    }
  }

  return segments
}

function parseCaptionXml(xml: string): string[] {
  const segments: string[] = []
  const hasSrvFormat = xml.includes("<p ")

  if (hasSrvFormat) {
    const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/g
    let pMatch
    while ((pMatch = pRegex.exec(xml)) !== null) {
      const inner = pMatch[1]
      const words: string[] = []
      const sRegex = /<s[^>]*>([\s\S]*?)<\/s>/g
      let sMatch
      while ((sMatch = sRegex.exec(inner)) !== null) {
        const word = decodeEntities(sMatch[1]).trim()
        if (word) words.push(word)
      }
      if (words.length > 0) {
        segments.push(words.join(""))
      }
    }
  } else {
    const textRegex = /<text[^>]*>([\s\S]*?)<\/text>/g
    let match
    while ((match = textRegex.exec(xml)) !== null) {
      const text = decodeEntities(match[1].replace(/<[^>]*>/g, "")).trim()
      if (text) segments.push(text)
    }
  }

  return segments
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
}

function normalizeForDedup(text: string): string {
  return text
    .replace(/[\u0617-\u061A\u064B-\u0652\u0670]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/ـ/g, "")
    .toLowerCase()
}

function cleanSegments(segments: string[]): string {
  const seen = new Set<string>()
  const cleaned: string[] = []

  for (const segment of segments) {
    const text = segment
      .replace(/\[.*?\]/g, "")
      .replace(/\(.*?\)/g, "")
      .trim()
      .replace(/\s+/g, " ")

    if (!text) continue

    const normalized = normalizeForDedup(text)
    if (seen.has(normalized)) continue
    seen.add(normalized)

    cleaned.push(text)
  }

  return cleaned.join(" ").replace(/\s+/g, " ").trim()
}
