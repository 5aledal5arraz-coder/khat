/**
 * Khat Brain — Best-intro selection prompt builder.
 *
 * Extracted from `lib/ai/analysis.ts::suggestBestIntro` in Phase 2.0
 * Batch 1. Byte-equivalent to the previous inline prompt; the call site
 * now uses this builder + VERSION constant so
 * `ai_runs.prompt_version` becomes meaningful for this feature.
 *
 * Do NOT edit the prompt body without bumping VERSION. The snapshot
 * test in `tests/prompts/snapshots.test.ts` enforces this contract.
 */

export const BEST_INTRO_PROMPT_VERSION = "best-intro-v1.0"

export interface BestIntroPromptInput {
  preparedTranscript: string
  videoTitle: string
  /** Episode duration in seconds, or null when unknown. */
  durationSeconds: number | null
}

export interface BuiltBestIntroPrompt {
  system: string
  user: string
  version: string
  input: Record<string, unknown>
}

export function buildBestIntroPrompt(
  input: BestIntroPromptInput,
): BuiltBestIntroPrompt {
  const durationMin = input.durationSeconds
    ? Math.round(input.durationSeconds / 60)
    : null

  const system = `أنت خبير في إنتاج البودكاست العربي ومتخصص في اختيار المقاطع الافتتاحية الجذابة.

## مهمتك:
حلل نص حلقة بودكاست واقترح أفضل مقطع مدته ~30 ثانية يمكن استخدامه كافتتاحية (تيزر) للحلقة.

## معايير الاختيار:
- يثير فضول المستمع فوراً ويجعله يريد سماع الحلقة كاملة
- يحتوي على فكرة مفاجئة، رأي جريء، سؤال محفز، أو قصة مشوقة
- مفهوم بدون سياق — يعمل كمقطع مستقل
- عاطفي أو فكري — يحرك شعوراً أو يطرح تساؤلاً
- ليس من أول 60 ثانية (المقدمة عادة عامة وغير جذابة)

## قواعد:
- الإجابة JSON فقط
- start_seconds و end_seconds بالثواني (الفرق ~30 ثانية)
${input.durationSeconds ? `- لا يتجاوز end_seconds المدة الكاملة (${input.durationSeconds} ثانية)` : "- قدّر الأوقات تقريبياً من موقع النص"}
- reason: جملتان تشرحان لماذا هذا المقطع هو الأفضل
- transcript_excerpt: النص الحرفي للمقطع المقترح (3-5 جمل)

## مخطط JSON:
{
  "start_seconds": 180,
  "end_seconds": 210,
  "reason": "سبب الاختيار...",
  "transcript_excerpt": "النص المقتبس..."
}`

  const user = `عنوان الحلقة: ${input.videoTitle}
${durationMin ? `المدة: ~${durationMin} دقيقة` : ""}

نص الحلقة:
${input.preparedTranscript}`

  return {
    system,
    user,
    version: BEST_INTRO_PROMPT_VERSION,
    input: {
      videoTitle: input.videoTitle,
      durationSeconds: input.durationSeconds,
      transcriptChars: input.preparedTranscript.length,
    },
  }
}
