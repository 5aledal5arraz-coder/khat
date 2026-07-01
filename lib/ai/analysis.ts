import { env } from "@/lib/env"
import type { StudioAnalyzerData, AudioEditSuggestion } from "@/types/database"
// Phase 2.0 Batch 1 — every generator in this file now routes through
// runAiTask + an extracted prompt builder. getClient + STRUCTURE_MODEL +
// EDITORIAL_MODEL no longer needed here.
import { prepareTranscript } from "./client"
import { runAiTask } from "@/lib/ai-router"
import {
  buildStudioAnalysisPrompt,
  STUDIO_ANALYSIS_PROMPT_VERSION,
} from "@/lib/ai/prompts/studio-analysis"
import {
  buildBestIntroPrompt,
  BEST_INTRO_PROMPT_VERSION,
} from "@/lib/ai/prompts/best-intro"
import {
  buildEditSuggestionsPrompt,
  EDIT_SUGGESTIONS_PROMPT_VERSION,
} from "@/lib/ai/prompts/edit-suggestions"

/** Phase 2.0 Batch 1 — fallback actor id for legacy call sites that
 *  haven't been migrated to thread a real admin/cron/eval actor. */
const LEGACY_ACTOR = "system:legacy-callsite"

interface EirContext {
  eirId?: string | null
  subjectTable?: string | null
  subjectId?: string | null
  actorId?: string | null
}

// ---------------------------------------------------------------------------
// Studio: Post-Publish YouTube Performance Analyzer
// ---------------------------------------------------------------------------

export interface YouTubeVideoStats {
  title: string
  description: string
  publishDate: string
  duration: string
  viewCount: string
  likeCount: string
  commentCount: string
}

/**
 * Analyze a published YouTube episode's performance and generate
 * actionable improvement suggestions.
 *
 * Phase 2.0 Batch 1 — routed via the AI Router. The previously inline
 * prompt now lives in `lib/ai/prompts/studio-analysis.ts` and is
 * snapshot-tested.
 */
export async function generateStudioAnalysis(
  transcript: string,
  stats: YouTubeVideoStats,
  eirContext?: EirContext,
): Promise<{ success: boolean; data?: StudioAnalyzerData; raw?: Record<string, unknown>; error?: string; runId?: string }> {
  if (!env.OPENAI_API_KEY) {
    return { success: false, error: "OPENAI_API_KEY غير مُعدّ" }
  }

  try {
    const preparedText = await prepareTranscript(null as never, transcript)
    const built = buildStudioAnalysisPrompt({
      preparedTranscript: preparedText,
      stats,
    })

    const result = await runAiTask<StudioAnalyzerData>({
      taskKind: "editorial",
      eirId: eirContext?.eirId ?? null,
      subjectTable: eirContext?.subjectTable ?? "studio_analyzer",
      subjectId: eirContext?.subjectId ?? null,
      actorId: eirContext?.actorId ?? LEGACY_ACTOR,
      promptVersion: STUDIO_ANALYSIS_PROMPT_VERSION,
      input: built.input,
      prompt: [
        { role: "system", content: built.system },
        { role: "user", content: built.user },
      ],
      expectJson: true,
      providerOptions: { temperature: 0.4 },
    })

    if (result.status !== "succeeded") {
      return {
        success: false,
        error: result.errorMessage || "حدث خطأ أثناء تحليل الأداء",
        runId: result.runId,
      }
    }

    const parsed = result.parsed
    if (!parsed?.diagnosis || !parsed?.improvements) {
      return { success: false, error: "استجابة OpenAI غير مكتملة", runId: result.runId }
    }

    // Ensure clips have used: false
    const clips = Array.isArray(parsed.clips)
      ? parsed.clips.map((c) => ({ ...c, used: false }))
      : []

    return {
      success: true,
      runId: result.runId,
      data: {
        diagnosis: parsed.diagnosis,
        improvements: {
          alt_titles: Array.isArray(parsed.improvements.alt_titles) ? parsed.improvements.alt_titles : [],
          optimized_description: parsed.improvements.optimized_description || "",
          chapters: parsed.improvements.chapters || "",
          pinned_comment: parsed.improvements.pinned_comment || "",
          thumbnail_concepts: Array.isArray(parsed.improvements.thumbnail_concepts) ? parsed.improvements.thumbnail_concepts : [],
        },
        revival: {
          steps: Array.isArray(parsed.revival?.steps)
            ? parsed.revival.steps.sort((a, b) => a.order - b.order)
            : [],
        },
        clips,
      },
      raw: {
        model: result.modelName,
        usage: { prompt_tokens: result.tokensIn, completion_tokens: result.tokensOut },
        run_id: result.runId,
      },
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : "حدث خطأ أثناء تحليل الأداء"
    return { success: false, error: msg }
  }
}

// ---------------------------------------------------------------------------
// Studio: Suggest Best 30-Second Intro for Audio Episodes
// ---------------------------------------------------------------------------

export interface BestIntroResult {
  start_seconds: number
  end_seconds: number
  reason: string
  transcript_excerpt: string
}

/**
 * Analyze a transcript and suggest the best ~30-second segment to use as
 * the episode opening. Looks for the most compelling, hook-worthy portion.
 *
 * Phase 2.0 Batch 1 — routed via the AI Router with extracted builder.
 */
export async function suggestBestIntro(
  transcript: string,
  videoTitle: string,
  durationSeconds: number | null,
  eirContext?: EirContext,
): Promise<{ success: boolean; data?: BestIntroResult; error?: string; runId?: string }> {
  if (!env.OPENAI_API_KEY) {
    return { success: false, error: "OPENAI_API_KEY غير مُعدّ" }
  }

  try {
    const preparedText = await prepareTranscript(null as never, transcript)
    const built = buildBestIntroPrompt({
      preparedTranscript: preparedText,
      videoTitle,
      durationSeconds,
    })

    const result = await runAiTask<BestIntroResult>({
      taskKind: "structural",
      eirId: eirContext?.eirId ?? null,
      subjectTable: eirContext?.subjectTable ?? "studio_audio_intro",
      subjectId: eirContext?.subjectId ?? null,
      actorId: eirContext?.actorId ?? LEGACY_ACTOR,
      promptVersion: BEST_INTRO_PROMPT_VERSION,
      input: built.input,
      prompt: [
        { role: "system", content: built.system },
        { role: "user", content: built.user },
      ],
      expectJson: true,
      providerOptions: { temperature: 0.3 },
    })

    if (result.status !== "succeeded") {
      return {
        success: false,
        error: result.errorMessage || "حدث خطأ أثناء تحليل الافتتاحية",
        runId: result.runId,
      }
    }

    const parsed = result.parsed
    if (!parsed || typeof parsed.start_seconds !== "number" || typeof parsed.end_seconds !== "number") {
      return { success: false, error: "استجابة OpenAI غير مكتملة", runId: result.runId }
    }

    return {
      success: true,
      runId: result.runId,
      data: {
        start_seconds: Math.max(0, Math.round(parsed.start_seconds)),
        end_seconds: Math.round(parsed.end_seconds),
        reason: parsed.reason || "",
        transcript_excerpt: parsed.transcript_excerpt || "",
      },
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : "حدث خطأ أثناء تحليل الافتتاحية"
    return { success: false, error: msg }
  }
}

// ---------------------------------------------------------------------------
// Studio: Generate Audio Edit/Cut Suggestions
// ---------------------------------------------------------------------------

export interface EditSuggestionsResult {
  suggestions: AudioEditSuggestion[]
  total_cut_seconds: number
}

/**
 * Analyze a podcast transcript and suggest segments that should be
 * edited out: long pauses, repetitive talk, off-topic rambling, filler.
 *
 * Phase 2.0 Batch 1 — routed via the AI Router with extracted builder.
 */
export async function generateEditSuggestions(
  transcript: string,
  videoTitle: string,
  durationSeconds: number | null,
  eirContext?: EirContext,
): Promise<{ success: boolean; data?: EditSuggestionsResult; error?: string; runId?: string }> {
  if (!env.OPENAI_API_KEY) {
    return { success: false, error: "OPENAI_API_KEY غير مُعدّ" }
  }

  try {
    const preparedText = await prepareTranscript(null as never, transcript)
    const built = buildEditSuggestionsPrompt({
      preparedTranscript: preparedText,
      videoTitle,
      durationSeconds,
    })

    const result = await runAiTask<EditSuggestionsResult>({
      taskKind: "structural",
      eirId: eirContext?.eirId ?? null,
      subjectTable: eirContext?.subjectTable ?? "studio_edit_suggestions",
      subjectId: eirContext?.subjectId ?? null,
      actorId: eirContext?.actorId ?? LEGACY_ACTOR,
      promptVersion: EDIT_SUGGESTIONS_PROMPT_VERSION,
      input: built.input,
      prompt: [
        { role: "system", content: built.system },
        { role: "user", content: built.user },
      ],
      expectJson: true,
      providerOptions: { temperature: 0.3 },
    })

    if (result.status !== "succeeded") {
      return {
        success: false,
        error: result.errorMessage || "حدث خطأ أثناء تحليل المقاطع",
        runId: result.runId,
      }
    }

    const parsed = result.parsed
    if (!parsed || !Array.isArray(parsed.suggestions)) {
      return { success: false, error: "استجابة OpenAI غير مكتملة", runId: result.runId }
    }

    // Validate and clean suggestions
    const validCategories = new Set(["long_pause", "repetitive", "off_topic", "filler", "other"])
    let suggestions = parsed.suggestions
      .filter((s) =>
        typeof s.start_seconds === "number" &&
        typeof s.end_seconds === "number" &&
        s.start_seconds < s.end_seconds &&
        s.reason &&
        validCategories.has(s.category)
      )
      .sort((a, b) => a.start_seconds - b.start_seconds)

    // Validate timestamps don't exceed duration
    if (durationSeconds) {
      suggestions = suggestions.filter((s) => s.end_seconds <= durationSeconds)
    }

    const totalCut = suggestions.reduce((sum, s) => sum + (s.end_seconds - s.start_seconds), 0)

    return {
      success: true,
      runId: result.runId,
      data: {
        suggestions,
        total_cut_seconds: totalCut,
      },
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : "حدث خطأ أثناء تحليل المقاطع"
    return { success: false, error: msg }
  }
}
