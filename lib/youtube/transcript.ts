import { normalizeArabic } from "@/lib/search"

interface TranscriptResult {
  success: boolean
  text: string
  error?: string
}

interface CaptionTrack {
  baseUrl: string
  languageCode: string
  kind: string
}

const ANDROID_USER_AGENT =
  "com.google.android.youtube/19.02.39 (Linux; U; Android 14) gzip"

/**
 * Fetch YouTube auto-generated or manual captions using the Android InnerTube
 * player API, which doesn't require PO tokens or browser cookies.
 */
export async function fetchTranscript(videoId: string): Promise<TranscriptResult> {
  try {
    // Step 1: Get caption tracks via InnerTube Android player endpoint
    const playerRes = await fetch(
      "https://www.youtube.com/youtubei/v1/player?prettyPrint=false",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": ANDROID_USER_AGENT,
        },
        body: JSON.stringify({
          context: {
            client: {
              clientName: "ANDROID",
              clientVersion: "19.02.39",
              androidSdkVersion: 34,
              hl: "ar",
              gl: "KW",
            },
          },
          videoId,
        }),
      }
    )

    if (!playerRes.ok) {
      return { success: false, text: "", error: `فشل في جلب بيانات الفيديو (${playerRes.status})` }
    }

    const playerData = await playerRes.json()
    const captionTracks: CaptionTrack[] =
      playerData?.captions?.playerCaptionsTracklistRenderer?.captionTracks || []

    if (captionTracks.length === 0) {
      return { success: false, text: "", error: "لا تتوفر ترجمة تلقائية لهذا الفيديو" }
    }

    // Step 2: Prefer Arabic, then fall back to first available
    const arTrack = captionTracks.find((t) => t.languageCode === "ar")
    const track = arTrack || captionTracks[0]

    // Step 3: Fetch the caption XML
    const captionRes = await fetch(track.baseUrl, {
      headers: { "User-Agent": ANDROID_USER_AGENT },
    })

    if (!captionRes.ok) {
      return { success: false, text: "", error: "فشل في جلب النص التلقائي" }
    }

    const xml = await captionRes.text()
    const segments = parseCaptionXml(xml)

    if (segments.length === 0) {
      return { success: false, text: "", error: "لا توجد نصوص في الترجمة" }
    }

    const text = cleanTranscript(segments)
    return { success: true, text }
  } catch (error) {
    const message = error instanceof Error ? error.message : "فشل في جلب النص"
    return { success: false, text: "", error: message }
  }
}

function parseCaptionXml(xml: string): string[] {
  const segments: string[] = []

  // YouTube's srv3 format uses <p> elements with <s> children
  // Also supports simple <text> elements for basic format
  const hasSrvFormat = xml.includes("<p ")

  if (hasSrvFormat) {
    // srv3 format: <p t="399" d="8561"><s ac="0">word</s><s t="680">word2</s></p>
    const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/g
    let pMatch
    while ((pMatch = pRegex.exec(xml)) !== null) {
      const inner = pMatch[1]
      // Extract text from <s> elements
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
    // Simple format: <text start="0" dur="5.2">text content</text>
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

export function cleanTranscript(segments: string[]): string {
  const seen = new Set<string>()
  const cleaned: string[] = []

  for (const segment of segments) {
    // Remove noise markers like [music], [applause], etc.
    let text = segment
      .replace(/\[.*?\]/g, "")
      .replace(/\(.*?\)/g, "")
      .trim()

    // Normalize whitespace
    text = text.replace(/\s+/g, " ")

    if (!text) continue

    // Deduplicate consecutive sentences using normalized Arabic
    const normalized = normalizeArabic(text)
    if (seen.has(normalized)) continue
    seen.add(normalized)

    cleaned.push(text)
  }

  return cleaned.join(" ").replace(/\s+/g, " ").trim()
}
