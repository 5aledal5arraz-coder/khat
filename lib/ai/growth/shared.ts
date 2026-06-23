/**
 * Growth generators — shared input shape + context formatting.
 *
 * Every growth generator synthesizes from the already-computed
 * GlobalEpisodeIntelligence (P0) plus a few episode facts, so none of them
 * needs the raw transcript. That keeps the Growth package cheap and coherent
 * (one shared understanding, many deliverables).
 */

import type { GlobalEpisodeIntelligence } from "@/lib/ai/episode-intelligence"
import { formatIntelligenceContext } from "@/lib/ai/episode-intelligence"

export interface GrowthChapter {
  start_time: string
  title: string
}

export interface GrowthGenInput {
  videoTitle: string
  channelTitle?: string | null
  durationSeconds?: number | null
  intelligence: GlobalEpisodeIntelligence
  /** Chapters (if generated) — used to anchor ad placements to real timestamps. */
  chapters?: GrowthChapter[]
  /** Best title already chosen for the episode (from ai_output), for continuity. */
  existingTitle?: string | null
  /** EIR scope for telemetry. */
  eirContext?: { eirId?: string | null; subjectTable?: string | null; subjectId?: string | null }
}

/** Telemetry-friendly input snapshot common to growth generators. */
export function growthInputSnapshot(input: GrowthGenInput): Record<string, unknown> {
  return {
    videoTitle: input.videoTitle,
    channelTitle: input.channelTitle ?? null,
    durationSeconds: input.durationSeconds ?? null,
    hasChapters: Boolean(input.chapters?.length),
    topicTags: input.intelligence.topic_tags.length,
  }
}

function fmtDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return "غير معروفة"
  const m = Math.round(seconds / 60)
  return `${m} دقيقة`
}

/**
 * The shared episode-context block injected into every growth prompt: the
 * deepened intelligence understanding plus a compact facts header and (when
 * available) the chapter map for timestamp anchoring.
 */
export function buildGrowthContextBlock(input: GrowthGenInput): string {
  const parts: string[] = []

  parts.push(`## حقائق الحلقة:
- العنوان: ${input.videoTitle}${input.existingTitle && input.existingTitle !== input.videoTitle ? `\n- العنوان المختار للنشر: ${input.existingTitle}` : ""}
- القناة: ${input.channelTitle || "خط بودكاست"}
- المدة: ${fmtDuration(input.durationSeconds)}`)

  parts.push(formatIntelligenceContext(input.intelligence))

  if (input.chapters && input.chapters.length > 0) {
    const chapterLines = input.chapters
      .map((c) => `- ${c.start_time} — ${c.title}`)
      .join("\n")
    parts.push(`## خريطة الفصول (للاستناد الزمني):\n${chapterLines}`)
  }

  return parts.join("\n\n")
}
