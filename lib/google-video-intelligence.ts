/**
 * Google Cloud Video Intelligence API client.
 *
 * Uses the REST API with an API key — no service account needed.
 * Only extracts visual signals (shot changes, labels, speech segments).
 * Content decisions are always made by OpenAI.
 */

import { env } from "@/lib/env"
const GOOGLE_VIDEO_API_KEY = env.GOOGLE_VIDEO_API_KEY
const API_BASE = "https://videointelligence.googleapis.com/v1"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ShotChange {
  startSeconds: number
  endSeconds: number
}

export interface LabelSegment {
  label: string
  confidence: number
  startSeconds: number
  endSeconds: number
}

export interface VideoAnalysis {
  shotChanges: ShotChange[]
  labels: LabelSegment[]
  durationSeconds: number
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function parseTimeOffset(offset: string | undefined): number {
  if (!offset) return 0
  // Format: "123.456s" or "123s"
  return parseFloat(offset.replace("s", "")) || 0
}

// ---------------------------------------------------------------------------
// Core: annotate a video
// ---------------------------------------------------------------------------

interface AnnotateRequest {
  inputUri?: string
  inputContent?: string // base64-encoded video bytes
  features: string[]
  videoContext?: Record<string, unknown>
}

interface AnnotateOperationResponse {
  name: string // operation ID
  done?: boolean
  response?: {
    annotationResults?: AnnotationResult[]
  }
  error?: { code: number; message: string }
}

interface AnnotationResult {
  shotAnnotations?: Array<{
    startTimeOffset?: string
    endTimeOffset?: string
  }>
  segmentLabelAnnotations?: Array<{
    entity: { description: string }
    segments: Array<{
      segment: { startTimeOffset?: string; endTimeOffset?: string }
      confidence: number
    }>
  }>
  segment?: {
    startTimeOffset?: string
    endTimeOffset?: string
  }
}

async function callAnnotate(
  body: AnnotateRequest
): Promise<AnnotateOperationResponse> {
  if (!GOOGLE_VIDEO_API_KEY) {
    throw new Error("GOOGLE_VIDEO_API_KEY غير مُعدّ في البيئة")
  }

  const res = await fetch(`${API_BASE}/videos:annotate?key=${GOOGLE_VIDEO_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => null)
    const msg = err?.error?.message || `Video Intelligence API returned ${res.status}`
    throw new Error(`Google Video Intelligence API error: ${msg}`)
  }

  return res.json()
}

async function pollOperation(operationName: string, maxWaitMs = 300_000): Promise<AnnotateOperationResponse> {
  if (!GOOGLE_VIDEO_API_KEY) {
    throw new Error("GOOGLE_VIDEO_API_KEY غير مُعدّ")
  }

  const startTime = Date.now()
  let delay = 5000 // start at 5s, increase

  while (Date.now() - startTime < maxWaitMs) {
    await new Promise((r) => setTimeout(r, delay))

    const res = await fetch(
      `https://videointelligence.googleapis.com/v1/${operationName}?key=${GOOGLE_VIDEO_API_KEY}`
    )

    if (!res.ok) {
      const err = await res.json().catch(() => null)
      throw new Error(`Poll error: ${err?.error?.message || res.status}`)
    }

    const op: AnnotateOperationResponse = await res.json()

    if (op.error) {
      throw new Error(`Video analysis failed: ${op.error.message}`)
    }

    if (op.done) {
      return op
    }

    // Increase delay up to 15s
    delay = Math.min(delay + 2000, 15000)
  }

  throw new Error("Video analysis timed out (exceeded 5 minutes)")
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Analyze a YouTube video using Google Video Intelligence.
 * Returns shot changes and label segments.
 *
 * Note: The Video Intelligence API requires gs:// URIs for inputUri.
 * For YouTube videos, the video must first be downloaded or a GCS URI provided.
 * This function accepts a GCS URI or attempts the YouTube URL directly.
 */
export async function analyzeVideo(videoUri: string): Promise<VideoAnalysis> {
  const operation = await callAnnotate({
    inputUri: videoUri,
    features: [
      "SHOT_CHANGE_DETECTION",
      "LABEL_DETECTION",
    ],
    videoContext: {
      shotChangeDetectionConfig: {
        model: "builtin/stable",
      },
      labelDetectionConfig: {
        labelDetectionMode: "SHOT_MODE",
        model: "builtin/stable",
      },
    },
  })

  // If already done (unlikely for video), use directly
  if (operation.done && operation.response) {
    return parseAnnotationResponse(operation.response)
  }

  // Otherwise poll for completion
  const completed = await pollOperation(operation.name)
  if (!completed.response) {
    throw new Error("No response from Video Intelligence API")
  }

  return parseAnnotationResponse(completed.response)
}

/**
 * Analyze video from base64 content (for uploaded audio/video files).
 */
export async function analyzeVideoContent(base64Content: string): Promise<VideoAnalysis> {
  const operation = await callAnnotate({
    inputContent: base64Content,
    features: [
      "SHOT_CHANGE_DETECTION",
      "LABEL_DETECTION",
    ],
    videoContext: {
      shotChangeDetectionConfig: {
        model: "builtin/stable",
      },
      labelDetectionConfig: {
        labelDetectionMode: "SHOT_MODE",
        model: "builtin/stable",
      },
    },
  })

  if (operation.done && operation.response) {
    return parseAnnotationResponse(operation.response)
  }

  const completed = await pollOperation(operation.name)
  if (!completed.response) {
    throw new Error("No response from Video Intelligence API")
  }

  return parseAnnotationResponse(completed.response)
}

function parseAnnotationResponse(response: { annotationResults?: AnnotationResult[] }): VideoAnalysis {
  const results = response.annotationResults?.[0]
  if (!results) {
    return { shotChanges: [], labels: [], durationSeconds: 0 }
  }

  // Parse shot changes
  const shotChanges: ShotChange[] = (results.shotAnnotations || []).map((shot) => ({
    startSeconds: parseTimeOffset(shot.startTimeOffset),
    endSeconds: parseTimeOffset(shot.endTimeOffset),
  }))

  // Parse labels with segments
  const labels: LabelSegment[] = []
  for (const annotation of results.segmentLabelAnnotations || []) {
    for (const seg of annotation.segments) {
      labels.push({
        label: annotation.entity.description,
        confidence: seg.confidence,
        startSeconds: parseTimeOffset(seg.segment.startTimeOffset),
        endSeconds: parseTimeOffset(seg.segment.endTimeOffset),
      })
    }
  }

  // Estimate duration from last shot or segment end
  let durationSeconds = 0
  if (results.segment?.endTimeOffset) {
    durationSeconds = parseTimeOffset(results.segment.endTimeOffset)
  } else if (shotChanges.length > 0) {
    durationSeconds = shotChanges[shotChanges.length - 1].endSeconds
  }

  return { shotChanges, labels, durationSeconds }
}

// ---------------------------------------------------------------------------
// Utility: summarize visual analysis for prompt injection
// ---------------------------------------------------------------------------

/**
 * Convert video analysis into a compact text block suitable for
 * injecting into an OpenAI prompt. Focuses on high-activity segments
 * (lots of shot changes) and prominent scene labels.
 */
export function summarizeForPrompt(analysis: VideoAnalysis, maxSegments = 30): string {
  const lines: string[] = []

  // Identify high-activity segments (dense shot changes within 30s windows)
  if (analysis.shotChanges.length > 0) {
    const windowSec = 30
    const windows: { start: number; end: number; count: number }[] = []

    for (let t = 0; t < analysis.durationSeconds; t += windowSec) {
      const windowEnd = t + windowSec
      const count = analysis.shotChanges.filter(
        (s) => s.startSeconds >= t && s.startSeconds < windowEnd
      ).length
      if (count >= 2) {
        windows.push({ start: t, end: windowEnd, count })
      }
    }

    // Sort by density, take top N
    windows.sort((a, b) => b.count - a.count)
    const top = windows.slice(0, maxSegments)
    top.sort((a, b) => a.start - b.start)

    if (top.length > 0) {
      lines.push("## مناطق عالية النشاط البصري (كثافة تغييرات اللقطات):")
      for (const w of top) {
        const startMin = Math.floor(w.start / 60)
        const startSec = Math.floor(w.start % 60)
        const endMin = Math.floor(w.end / 60)
        const endSec = Math.floor(w.end % 60)
        lines.push(
          `- ${String(startMin).padStart(2, "0")}:${String(startSec).padStart(2, "0")} → ${String(endMin).padStart(2, "0")}:${String(endSec).padStart(2, "0")} (${w.count} تغيير لقطة)`
        )
      }
    }
  }

  // Add prominent labels
  if (analysis.labels.length > 0) {
    // Group by label, pick most confident
    const labelMap = new Map<string, { label: string; confidence: number; start: number; end: number }>()
    for (const seg of analysis.labels) {
      const existing = labelMap.get(seg.label)
      if (!existing || seg.confidence > existing.confidence) {
        labelMap.set(seg.label, {
          label: seg.label,
          confidence: seg.confidence,
          start: seg.startSeconds,
          end: seg.endSeconds,
        })
      }
    }

    const topLabels = [...labelMap.values()]
      .filter((l) => l.confidence >= 0.5)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 15)

    if (topLabels.length > 0) {
      lines.push("")
      lines.push("## تسميات المشاهد المكتشفة:")
      for (const l of topLabels) {
        lines.push(`- "${l.label}" (ثقة ${Math.round(l.confidence * 100)}%)`)
      }
    }
  }

  lines.push("")
  lines.push(`إجمالي تغييرات اللقطات: ${analysis.shotChanges.length}`)

  return lines.join("\n")
}

/**
 * Check if the Google Video Intelligence API key is configured.
 */
export function isVideoIntelligenceConfigured(): boolean {
  return !!GOOGLE_VIDEO_API_KEY
}
