/**
 * ص-٥ — resolve segment ids back into REAL seconds.
 *
 * Pure and exported so the id→seconds step is unit-testable without any
 * paid AI call, mirroring `resolveEpisodeMap`. Every rejection throws with
 * a clear message: a caller holding a returned value is holding output
 * whose every timestamp came from the caption file, not from the model.
 */

import type {
  StudioChapterItem,
  StudioClipItem,
  WebsiteTimestampItem,
} from "@/types/database"
import type { TimedSegment } from "@/lib/studio/segments"
import { formatSecondsToTimestamp } from "./client"
import type {
  TimedChapterModelItem,
  TimedClipModelItem,
  TimedTimestampModelItem,
} from "./prompts/studio-timed"

export type WindowMap = Map<string, { segment: TimedSegment; index: number }>

/** Same id scheme `renderWithIds` emits: 1-based, `S` + zero-padded to 3. */
export function windowIdFor(index: number): string {
  return `S${String(index + 1).padStart(3, "0")}`
}

export function buildWindowMap(windows: TimedSegment[]): WindowMap {
  const map: WindowMap = new Map()
  windows.forEach((segment, index) => {
    map.set(windowIdFor(index), { segment, index })
  })
  return map
}

/**
 * Chapters: the model gave us window ids; the clock is ours.
 *
 * Note what is deliberately NOT here: the old path "relocated" the last
 * chapter to 95% of the duration whenever coverage looked short. That was
 * inventing a timestamp to satisfy a heuristic. With real timings, short
 * coverage is information, not something to paper over.
 */
export function resolveTimedChapters(
  items: TimedChapterModelItem[],
  segMap: WindowMap,
): StudioChapterItem[] {
  const resolved: { seconds: number; title: string }[] = []

  for (const item of items) {
    if (!item?.start_segment_id || !item?.title?.trim()) continue
    const hit = segMap.get(item.start_segment_id)
    if (!hit) {
      throw new Error(
        `studio-timed: chapter start_segment_id "${item.start_segment_id}" is not a real window id`,
      )
    }
    resolved.push({ seconds: hit.segment.start, title: item.title.trim() })
  }

  if (resolved.length === 0) {
    throw new Error("studio-timed: no chapters resolved to a real window")
  }

  resolved.sort((a, b) => a.seconds - b.seconds)

  // Drop duplicate anchors — two titles on one window is one chapter.
  const deduped = resolved.filter(
    (c, i) => i === 0 || c.seconds !== resolved[i - 1].seconds,
  )

  // YouTube requires the first chapter at 00:00:00. Anchoring the earliest
  // CHOSEN chapter is honest (it is still the model's pick); inventing an
  // extra chapter would not be.
  deduped[0] = { ...deduped[0], seconds: 0 }

  return deduped.map((c) => ({
    start_time: formatSecondsToTimestamp(c.seconds),
    title: c.title,
  }))
}

/**
 * The public episode index — same contract as chapters, different shape.
 *
 * `WebsiteTimestampItem` carries raw seconds rather than a clock string,
 * so this is where the caption window's start becomes `time_seconds`. The
 * legacy path let the model compute that number from an interpolated
 * label; here the model never sees a number at all.
 *
 * Deliberately NOT here: any "first entry must be 0" rewrite. Chapters
 * force it because YouTube rejects a chapter block that doesn't start at
 * 00:00:00 — the public page has no such rule, so the first index row
 * keeps the real start of the window the model actually chose.
 */
export function resolveTimedTimestamps(
  items: TimedTimestampModelItem[],
  segMap: WindowMap,
): WebsiteTimestampItem[] {
  const resolved: WebsiteTimestampItem[] = []

  for (const item of items) {
    if (!item?.start_segment_id || !item?.title?.trim()) continue
    const hit = segMap.get(item.start_segment_id)
    if (!hit) {
      throw new Error(
        `studio-timed: timestamp start_segment_id "${item.start_segment_id}" is not a real window id`,
      )
    }
    const description =
      typeof item.description === "string" && item.description.trim()
        ? item.description.trim()
        : null
    resolved.push({
      time_seconds: Math.round(hit.segment.start),
      title: item.title.trim(),
      description,
    })
  }

  if (resolved.length === 0) {
    throw new Error("studio-timed: no timestamps resolved to a real window")
  }

  resolved.sort((a, b) => a.time_seconds - b.time_seconds)

  // Two titles on one window is one index row.
  return resolved.filter(
    (t, i) => i === 0 || t.time_seconds !== resolved[i - 1].time_seconds,
  )
}

/**
 * Clips: both ends come from window ids, so a clip can no longer carry an
 * impossible clock value like "00:64:20" — the previous generator emitted
 * exactly that and nothing rejected it.
 */
export function resolveTimedClips(
  items: TimedClipModelItem[],
  segMap: WindowMap,
): StudioClipItem[] {
  const out: StudioClipItem[] = []

  for (const item of items) {
    if (!item?.start_segment_id || !item?.end_segment_id) continue
    const start = segMap.get(item.start_segment_id)
    const end = segMap.get(item.end_segment_id)
    if (!start) {
      throw new Error(
        `studio-timed: clip start_segment_id "${item.start_segment_id}" is not a real window id`,
      )
    }
    if (!end) {
      throw new Error(
        `studio-timed: clip end_segment_id "${item.end_segment_id}" is not a real window id`,
      )
    }
    if (end.index < start.index) {
      // Drop rather than throw: one reversed range should not lose the
      // whole batch, but it must never reach the editor.
      console.warn(
        `[studio-timed] dropping clip with reversed range ${item.start_segment_id}→${item.end_segment_id}`,
      )
      continue
    }

    out.push({
      start_time: formatSecondsToTimestamp(start.segment.start),
      end_time: formatSecondsToTimestamp(end.segment.end),
      platform: item.platform?.trim() || "YouTube Shorts",
      hook_text: item.hook?.trim() || "",
      caption: item.title?.trim() || "",
      why_it_works: item.reason?.trim() || "",
      clip_title: item.title?.trim() || "",
    })
  }

  if (out.length === 0) {
    throw new Error("studio-timed: no clips resolved to a real window range")
  }

  return out.sort(
    (a, b) =>
      parseClock(a.start_time) - parseClock(b.start_time),
  )
}

/**
 * The accuracy claim for the timed path is "a chapter cannot be further
 * from its topic than the span of the window it points at". That holds
 * only while windows stay short — and `mergeIntoWindows` grows a window
 * until adding the NEXT segment would exceed the target, so a single long
 * caption cue can push one past it. Nothing measured this before, so the
 * ≤30s figure was true for the reference episode and merely assumed for
 * every other one.
 *
 * This does not throw: one long cue should not cost the operator the
 * whole generation. It measures, so the claim is checkable per episode
 * instead of taken on faith.
 */
export const MAX_WINDOW_SPAN_SECONDS = 30

export interface WindowSpanReport {
  maxSpanSeconds: number
  overLimit: number
  withinClaim: boolean
}

export function assessWindowSpans(windows: TimedSegment[]): WindowSpanReport {
  let maxSpanSeconds = 0
  let overLimit = 0
  for (const w of windows) {
    const span = w.end - w.start
    if (span > maxSpanSeconds) maxSpanSeconds = span
    if (span > MAX_WINDOW_SPAN_SECONDS) overLimit++
  }
  return {
    maxSpanSeconds: Math.round(maxSpanSeconds * 100) / 100,
    overLimit,
    withinClaim: overLimit === 0,
  }
}

/**
 * How much of the episode the chosen chapters actually reach.
 *
 * Removing the old "relocate the last chapter to 95%" hack was right — it
 * invented a timestamp to satisfy a coverage heuristic — but it was also
 * hiding a real weakness: on the reference episode the last chapter sits
 * at 77.4%, leaving 48.7 minutes with no chapter at all, and the largest
 * gap between two chapters is 27 minutes. The answer is to TELL the
 * operator, not to fabricate an anchor.
 */
export const MAX_TAIL_GAP_SECONDS = 15 * 60
export const MAX_INTERNAL_GAP_SECONDS = 20 * 60

export interface CoverageReport {
  lastChapterSeconds: number
  coveredFraction: number
  tailGapSeconds: number
  maxInternalGapSeconds: number
  /** Operator-facing Arabic, or null when coverage looks healthy. */
  warning: string | null
}

export function assessChapterCoverage(
  chapters: StudioChapterItem[],
  episodeEndSeconds: number,
): CoverageReport {
  const starts = chapters.map((c) => parseClock(c.start_time)).sort((a, b) => a - b)
  const last = starts.length > 0 ? starts[starts.length - 1] : 0
  const tailGapSeconds = Math.max(0, episodeEndSeconds - last)

  let maxInternalGapSeconds = 0
  for (let i = 1; i < starts.length; i++) {
    const gap = starts[i] - starts[i - 1]
    if (gap > maxInternalGapSeconds) maxInternalGapSeconds = gap
  }

  const problems: string[] = []
  if (tailGapSeconds > MAX_TAIL_GAP_SECONDS) {
    problems.push(
      `آخر فصل عند ${Math.round((last / episodeEndSeconds) * 100)}% من الحلقة — ` +
        `${Math.round(tailGapSeconds / 60)} دقيقة بلا أي فصل`,
    )
  }
  if (maxInternalGapSeconds > MAX_INTERNAL_GAP_SECONDS) {
    problems.push(
      `أكبر فجوة بين فصلين ${Math.round(maxInternalGapSeconds / 60)} دقيقة`,
    )
  }

  return {
    lastChapterSeconds: last,
    coveredFraction:
      episodeEndSeconds > 0 ? Math.round((last / episodeEndSeconds) * 1000) / 1000 : 0,
    tailGapSeconds,
    maxInternalGapSeconds,
    warning: problems.length > 0 ? `تغطية ناقصة — ${problems.join(" · ")}` : null,
  }
}

function parseClock(hhmmss: string): number {
  const [h = 0, m = 0, s = 0] = hhmmss.split(":").map(Number)
  return h * 3600 + m * 60 + s
}
