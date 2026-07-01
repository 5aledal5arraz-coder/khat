// Phase 2.0 Batch 2 — routed via the AI Router. The previously inline
// prompt now lives in `lib/ai/prompts/guest-intelligence.ts` and is
// snapshot-tested.
import { env } from "@/lib/env"
import { prepareTranscript } from "./client"
import { runAiTask } from "@/lib/ai-router"
import {
  buildGuestIntelligencePrompt,
  GUEST_INTELLIGENCE_PROMPT_VERSION,
} from "@/lib/ai/prompts/guest-intelligence"
import type { StudioGuestIntelligence } from "@/types/database"
import type { GlobalEpisodeIntelligence } from "./episode-intelligence"
import { formatIntelligenceContext } from "./episode-intelligence"

/** Phase 2.0 Batch 2 — fallback actor id for legacy call sites. */
const LEGACY_ACTOR = "system:legacy-callsite"

type GuestIntelligenceData = Pick<StudioGuestIntelligence,
  "detected_name" | "detected_bio" | "confidence_score" | "speaking_style" |
  "key_positions" | "notable_quotes"
>

interface EirContext {
  eirId?: string | null
  subjectTable?: string | null
  subjectId?: string | null
  actorId?: string | null
}

export async function generateGuestIntelligence(
  transcript: string,
  videoTitle: string,
  episodeIntelligence?: GlobalEpisodeIntelligence | null,
  eirContext?: EirContext,
): Promise<{ success: true; data: GuestIntelligenceData; raw?: Record<string, unknown>; runId?: string } | { success: false; error: string; runId?: string }> {
  if (!env.OPENAI_API_KEY) {
    return { success: false, error: "OPENAI_API_KEY غير مُعدّ" }
  }

  try {
    const preparedText = await prepareTranscript(null as never, transcript)
    const intelligenceBlock = episodeIntelligence
      ? `\n\n${formatIntelligenceContext(episodeIntelligence)}`
      : ""
    const built = buildGuestIntelligencePrompt({
      preparedTranscript: preparedText,
      videoTitle,
      intelligenceBlock,
      hasIntelligence: Boolean(episodeIntelligence),
    })

    const result = await runAiTask<{
      detected_name?: string | null
      detected_bio?: string | null
      confidence_score?: number | null
      speaking_style?: string | null
      key_positions?: GuestIntelligenceData["key_positions"]
      notable_quotes?: GuestIntelligenceData["notable_quotes"]
    }>({
      taskKind: "editorial",
      eirId: eirContext?.eirId ?? null,
      subjectTable: eirContext?.subjectTable ?? "studio_guest_intelligence",
      subjectId: eirContext?.subjectId ?? null,
      actorId: eirContext?.actorId ?? LEGACY_ACTOR,
      promptVersion: GUEST_INTELLIGENCE_PROMPT_VERSION,
      input: built.input,
      prompt: [
        { role: "system", content: built.system },
        { role: "user", content: built.user },
      ],
      expectJson: true,
      providerOptions: { temperature: 0.3, max_tokens: 2000 },
    })

    if (result.status !== "succeeded") {
      return {
        success: false,
        error: result.errorMessage || "لم يتم إنتاج رد من OpenAI",
        runId: result.runId,
      }
    }

    const parsed = result.parsed
    if (!parsed) {
      return { success: false, error: "لم يتم إنتاج رد من OpenAI", runId: result.runId }
    }

    return {
      success: true,
      runId: result.runId,
      data: {
        detected_name:
          typeof parsed.detected_name === "string" &&
          parsed.detected_name.toLowerCase() !== "null"
            ? parsed.detected_name
            : null,
        detected_bio:
          typeof parsed.detected_bio === "string" &&
          parsed.detected_bio.toLowerCase() !== "null"
            ? parsed.detected_bio
            : null,
        confidence_score:
          typeof parsed.confidence_score === "number" ? parsed.confidence_score : null,
        speaking_style: parsed.speaking_style || null,
        key_positions: parsed.key_positions || [],
        notable_quotes: parsed.notable_quotes || [],
      },
      raw: {
        model: result.modelName,
        usage: { prompt_tokens: result.tokensIn, completion_tokens: result.tokensOut },
        run_id: result.runId,
      },
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : "حدث خطأ أثناء تحليل الضيف"
    return { success: false, error: msg }
  }
}
