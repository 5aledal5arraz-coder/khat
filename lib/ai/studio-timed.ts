/**
 * ص-٥ — resolve segment ids back into REAL seconds.
 *
 * Pure and exported so the id→seconds step is unit-testable without any
 * paid AI call, mirroring `resolveEpisodeMap`. Every rejection throws with
 * a clear message: a caller holding a returned value is holding output
 * whose every timestamp came from the caption file, not from the model.
 */

import type { StudioChapterItem, StudioClipItem } from "@/types/database"
import type { TimedSegment } from "@/lib/studio/segments"
import { formatSecondsToTimestamp } from "./client"
import type {
  TimedChapterModelItem,
  TimedClipModelItem,
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

function parseClock(hhmmss: string): number {
  const [h = 0, m = 0, s = 0] = hhmmss.split(":").map(Number)
  return h * 3600 + m * 60 + s
}
