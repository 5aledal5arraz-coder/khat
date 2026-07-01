// Phase 2.0 Batch 1 — getClient + EDITORIAL_MODEL no longer needed.
import { env } from "@/lib/env"
import { prepareTranscript } from "./client"
import { runAiTask } from "@/lib/ai-router"
import type { StudioDeepAnalysis } from "@/types/database"
import type { GlobalEpisodeIntelligence } from "./episode-intelligence"
import { formatIntelligenceContext } from "./episode-intelligence"

/** Phase 2.0 Batch 1 — fallback actor id for legacy call sites. */
const LEGACY_ACTOR = "system:legacy-callsite"

type DeepAnalysisData = Pick<StudioDeepAnalysis,
  "themes" | "thesis" | "arguments" | "emotional_moments" | "lessons" |
  "contradictions" | "dialogue_map" | "conversation_arc" | "open_questions"
>

export async function generateDeepAnalysis(
  transcript: string,
  videoTitle: string,
  episodeIntelligence?: GlobalEpisodeIntelligence | null,
  eirContext?: { eirId?: string | null; subjectTable?: string | null; subjectId?: string | null; actorId?: string | null }
): Promise<{ success: true; data: DeepAnalysisData; raw?: Record<string, unknown>; runId?: string } | { success: false; error: string; runId?: string }> {
  try {
    if (!env.OPENAI_API_KEY) {
      return { success: false, error: "OPENAI_API_KEY غير مُعدّ" }
    }
    const preparedText = await prepareTranscript(null as never, transcript)
    const intelligenceBlock = episodeIntelligence ? `\n\n${formatIntelligenceContext(episodeIntelligence)}` : ""

    const systemPrompt = `أنت المحلل الفكري لبودكاست خط — بودكاست عربي عميق يتميز بالذكاء العاطفي والحدة الفكرية.

مهمتك: تحليل عميق وشامل للحلقة كعمل فكري متكامل.

${episodeIntelligence ? "⚠️ لديك فهم شامل مسبق للحلقة (القوس السردي، المحاور، نقاط التحول، الذرى العاطفية). ابنِ عليه وأضف عمقاً — لا تعالج النص من الصفر." : ""}

## المطلوب:
أعد JSON بالبنية التالية:

{
  "themes": [{"name": "اسم المحور", "description": "وصف مختصر", "evidence": ["دليل 1", "دليل 2"]}],
  "thesis": "الأطروحة الرئيسية أو الفكرة المركزية للحلقة",
  "arguments": [{"claim": "الادعاء", "supporting_evidence": ["دليل داعم"], "counter_points": ["نقاط مضادة إن وُجدت"]}],
  "emotional_moments": [{"timestamp_approx": "بداية/منتصف/نهاية", "description": "وصف اللحظة", "emotion": "المشاعر", "quote": "الاقتباس"}],
  "lessons": [{"title": "عنوان الدرس", "explanation": "الشرح", "applicability": "كيف يمكن تطبيقه"}],
  "contradictions": [{"point_a": "النقطة الأولى", "point_b": "النقطة المعاكسة", "context": "السياق"}],
  "dialogue_map": {"speakers": ["المتحدث 1", "المتحدث 2"], "dynamics": "وصف ديناميكية الحوار", "power_shifts": ["تحولات في السيطرة على الحوار"]},
  "conversation_arc": "وصف قوس المحادثة من البداية للنهاية",
  "open_questions": ["سؤال مفتوح 1", "سؤال مفتوح 2"]
}

## إرشادات:
- استخرج 3-6 محاور رئيسية مع أدلة من النص
- حدد الأطروحة المركزية بجملة واحدة واضحة
- ابحث عن لحظات عاطفية مؤثرة (فرح، حزن، غضب، دهشة)
- استخلص دروساً عملية قابلة للتطبيق
- إذا وُجدت تناقضات في الكلام، سجّلها بموضوعية
- صِف خريطة الحوار بين المتحدثين وديناميكيته
- اختم بأسئلة مفتوحة أثارتها الحلقة دون إجابة`

    const userPrompt = `عنوان الحلقة: ${videoTitle}
${intelligenceBlock}
النص:
${preparedText}`

    const result = await runAiTask<Partial<DeepAnalysisData>>({
      taskKind: "editorial",
      eirId: eirContext?.eirId ?? null,
      subjectTable: eirContext?.subjectTable ?? "studio_deep_analysis",
      subjectId: eirContext?.subjectId ?? null,
      actorId: eirContext?.actorId ?? LEGACY_ACTOR,
      input: {
        videoTitle,
        hasIntelligence: Boolean(episodeIntelligence),
        transcriptChars: preparedText.length,
      },
      prompt: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      expectJson: true,
      providerOptions: { temperature: 0.3, max_tokens: 4000 },
    })

    if (result.status !== "succeeded") {
      return {
        success: false,
        error: result.errorMessage || "حدث خطأ أثناء التحليل العميق",
        runId: result.runId,
      }
    }

    const parsed = result.parsed ?? {}

    return {
      success: true,
      data: {
        themes: parsed.themes ?? [],
        thesis: parsed.thesis ?? null,
        arguments: parsed.arguments ?? [],
        emotional_moments: parsed.emotional_moments ?? [],
        lessons: parsed.lessons ?? [],
        contradictions: parsed.contradictions ?? [],
        dialogue_map: parsed.dialogue_map ?? null,
        conversation_arc: parsed.conversation_arc ?? null,
        open_questions: parsed.open_questions ?? [],
      },
      raw: {
        model: result.modelName,
        usage: { prompt_tokens: result.tokensIn, completion_tokens: result.tokensOut },
        run_id: result.runId,
      },
      runId: result.runId,
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : "حدث خطأ أثناء التحليل العميق"
    return { success: false, error: msg }
  }
}
