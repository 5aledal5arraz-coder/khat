/**
 * Client-side YouTube transcript extraction via our CORS proxy.
 *
 * YouTube blocks both:
 *  - Server-side InnerTube requests (datacenter IPs → "session not found")
 *  - Browser cross-origin fetches (no CORS headers on youtube.com)
 *
 * Solution: a thin proxy at /api/admin/studio/youtube-proxy that forwards
 * requests to YouTube using the WEB InnerTube client. This module calls
 * that proxy and parses the captions in the browser.
 *
 * Flow:
 *  1. GET /youtube-proxy?action=tracks&videoId=X  → caption track list
 *  2. GET /youtube-proxy?action=captions&url=X    → raw caption JSON/XML
 *  3. Parse and clean captions (in browser)
 *  4. Return { success, text, language }
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

/**
 * Extract transcript from YouTube via our proxy.
 */
export async function fetchTranscriptClient(
  videoId: string
): Promise<ClientTranscriptResult> {
  try {
    // Step 1: Get caption tracks via proxy → InnerTube WEB client
    const tracksRes = await fetch(
      `${PROXY_BASE}?action=tracks&videoId=${encodeURIComponent(videoId)}`
    )

    if (!tracksRes.ok) {
      const err = await tracksRes.json().catch(() => ({}))
      return {
        success: false,
        text: "",
        language: "",
        error: (err as { error?: string }).error || `فشل في جلب بيانات الفيديو (${tracksRes.status})`,
      }
    }

    const tracksData = await tracksRes.json()
    const captionTracks: CaptionTrack[] = tracksData?.captionTracks || []

    if (captionTracks.length === 0) {
      return {
        success: false,
        text: "",
        language: "",
        error: "لا تتوفر ترجمة تلقائية لهذا الفيديو",
      }
    }

    // Step 2: Pick best track — prefer Arabic manual, then Arabic auto, then first
    const track = pickBestTrack(captionTracks)
    const language = track.languageCode

    // Step 3: Fetch caption content via proxy (JSON3 format preferred)
    const captionUrl = track.baseUrl.includes("?")
      ? `${track.baseUrl}&fmt=json3`
      : `${track.baseUrl}?fmt=json3`

    const captionRes = await fetch(
      `${PROXY_BASE}?action=captions&url=${encodeURIComponent(captionUrl)}`
    )

    if (!captionRes.ok) {
      // Fallback: try XML format
      return await fetchCaptionXml(track.baseUrl, language)
    }

    // Try to parse as JSON3
    const captionText = await captionRes.text()
    let segments: string[] = []

    try {
      const captionData = JSON.parse(captionText)
      segments = parseJson3Captions(captionData)
    } catch {
      // Response wasn't valid JSON — maybe it's XML, try XML parse
      segments = parseCaptionXml(captionText)
    }

    if (segments.length === 0) {
      // Fallback to plain XML
      return await fetchCaptionXml(track.baseUrl, language)
    }

    const text = cleanSegments(segments)
    if (!text) {
      return {
        success: false,
        text: "",
        language,
        error: "لا توجد نصوص في الترجمة",
      }
    }

    return { success: true, text, language }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "فشل في جلب النص من يوتيوب"
    return { success: false, text: "", language: "", error: message }
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function pickBestTrack(tracks: CaptionTrack[]): CaptionTrack {
  // 1. Arabic manual captions (no kind = "asr")
  const arManual = tracks.find(
    (t) => t.languageCode === "ar" && t.kind !== "asr"
  )
  if (arManual) return arManual

  // 2. Arabic auto-generated
  const arAuto = tracks.find((t) => t.languageCode === "ar")
  if (arAuto) return arAuto

  // 3. Any manual track
  const anyManual = tracks.find((t) => t.kind !== "asr")
  if (anyManual) return anyManual

  // 4. First available
  return tracks[0]
}

/**
 * Parse YouTube's json3 caption format.
 * Structure: { events: [{ segs: [{ utf8: "text" }], ... }] }
 */
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

/**
 * Fallback: fetch and parse XML caption format via proxy.
 */
async function fetchCaptionXml(
  baseUrl: string,
  language: string
): Promise<ClientTranscriptResult> {
  try {
    const res = await fetch(
      `${PROXY_BASE}?action=captions&url=${encodeURIComponent(baseUrl)}`
    )
    if (!res.ok) {
      return {
        success: false,
        text: "",
        language,
        error: "فشل في جلب النص التلقائي",
      }
    }

    const xml = await res.text()
    const segments = parseCaptionXml(xml)

    if (segments.length === 0) {
      return {
        success: false,
        text: "",
        language,
        error: "لا توجد نصوص في الترجمة",
      }
    }

    const text = cleanSegments(segments)
    return { success: true, text, language }
  } catch {
    return {
      success: false,
      text: "",
      language,
      error: "فشل في جلب النص التلقائي",
    }
  }
}

function parseCaptionXml(xml: string): string[] {
  const segments: string[] = []

  // srv3 format: <p> with <s> children
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
    // Simple format: <text start="0" dur="5.2">text</text>
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

/**
 * Normalize Arabic text for deduplication.
 */
function normalizeForDedup(text: string): string {
  return text
    .replace(/[\u0617-\u061A\u064B-\u0652\u0670]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/ـ/g, "")
    .toLowerCase()
}

/**
 * Clean and deduplicate caption segments into a single transcript string.
 */
function cleanSegments(segments: string[]): string {
  const seen = new Set<string>()
  const cleaned: string[] = []

  for (const segment of segments) {
    let text = segment
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
