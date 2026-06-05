/**
 * Khat Brain — Audio edit-suggestions prompt builder.
 *
 * Extracted from `lib/ai/analysis.ts::generateEditSuggestions` in Phase
 * 2.0 Batch 1. Byte-equivalent to the previous inline prompt; the call
 * site now uses this builder + VERSION constant so
 * `ai_runs.prompt_version` becomes meaningful for this feature.
 *
 * Do NOT edit the prompt body without bumping VERSION. The snapshot
 * test in `tests/prompts/snapshots.test.ts` enforces this contract.
 */

export const EDIT_SUGGESTIONS_PROMPT_VERSION = "edit-suggestions-v1.0"

export interface EditSuggestionsPromptInput {
  preparedTranscript: string
  videoTitle: string
  /** Episode duration in seconds, or null when unknown. */
  durationSeconds: number | null
}

export interface BuiltEditSuggestionsPrompt {
  system: string
  user: string
  version: string
  input: Record<string, unknown>
}

export function buildEditSuggestionsPrompt(
  input: EditSuggestionsPromptInput,
): BuiltEditSuggestionsPrompt {
  const durationMin = input.durationSeconds
    ? Math.round(input.durationSeconds / 60)
    : null

  const system = `أنت مهندس صوت محترف ومحرر بودكاست عربي متخصص في تحسين جودة الحلقات بعد التسجيل.

## مهمتك:
حلل نص حلقة بودكاست واقترح المقاطع التي يجب حذفها أو قصها أثناء المونتاج لتحسين جودة الحلقة.

## أنواع المقاطع المطلوب اكتشافها:

### 1. صمت طويل / توقف (long_pause)
- فترات صمت طويلة أو تردد واضح في الكلام
- علامات: "آآآ"، "إممم"، تكرار بدايات جمل بشكل متقطع

### 2. كلام مكرر (repetitive)
- إعادة نفس الفكرة أو الجملة بصياغات مختلفة دون إضافة قيمة جديدة
- تكرار نفس القصة أو المثال

### 3. خارج الموضوع (off_topic)
- استطرادات لا علاقة لها بمحور الحلقة
- أحاديث جانبية أو تعليقات تقنية (مشاكل الصوت، طلب ماء، إلخ)

### 4. حشو وكلام زائد (filler)
- مقدمات طويلة بلا محتوى فعلي
- تكرار عبارات مثل "يعني"، "بشكل عام"، "كما قلت سابقاً" بشكل مفرط
- تلخيصات زائدة عن الحاجة

## قواعد صارمة:
- الإجابة JSON فقط بالمخطط المحدد
- start_seconds و end_seconds بالثواني
- start_seconds < end_seconds دائماً
${input.durationSeconds ? `- لا يتجاوز end_seconds المدة الكاملة (${input.durationSeconds} ثانية)` : "- قدّر الأوقات تقريبياً بناءً على موقع النص في الحلقة"}
- reason: جملة واحدة واضحة تشرح سبب الحذف
- category: أحد القيم التالية فقط: "long_pause" | "repetitive" | "off_topic" | "filler" | "other"
- رتّب الاقتراحات تصاعدياً حسب start_seconds
- اقترح فقط المقاطع التي حذفها سيحسّن الحلقة فعلاً — لا تبالغ

## مخطط JSON المطلوب:
{
  "suggestions": [
    {
      "start_seconds": 120,
      "end_seconds": 145,
      "category": "long_pause",
      "reason": "توقف طويل مع تردد وإعادة بداية الجملة عدة مرات"
    }
  ],
  "total_cut_seconds": 180
}`

  const user = `عنوان الحلقة: ${input.videoTitle}
${durationMin ? `المدة الكاملة: ~${durationMin} دقيقة` : ""}

نص الحلقة:
${input.preparedTranscript}`

  return {
    system,
    user,
    version: EDIT_SUGGESTIONS_PROMPT_VERSION,
    input: {
      videoTitle: input.videoTitle,
      durationSeconds: input.durationSeconds,
      transcriptChars: input.preparedTranscript.length,
    },
  }
}
