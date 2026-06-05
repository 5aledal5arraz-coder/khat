/**
 * Khat Brain — Guest-extraction prompt builders.
 *
 * Extracted from `lib/ai/guest.ts` in Phase 2.0 Batch 2.
 * Two prompts: single-episode extract + batch detect.
 */

export const GUEST_EXTRACT_PROMPT_VERSION = "guest-extract-v1.0"
export const GUEST_DETECTION_BATCH_PROMPT_VERSION = "guest-detection-batch-v1.0"

const EXTRACT_SYSTEM = `أنت مساعد ذكي لبودكاست عربي. مهمتك استخراج اسم الضيف ونبذة قصيرة عنه فقط.

## التعليمات:
- استخرج الاسم الكامل لضيف الحلقة من النص أو العنوان
- لا تذكر اسم المقدّم/المحاور — فقط الضيف
- إذا كان هناك أكثر من ضيف، اختر الضيف الرئيسي
- guest_bio: نبذة قصيرة عن الضيف (جملة أو جملتان) مستخلصة من النص
- إذا لم يكن هناك ضيف واضح، أعد null لكلا الحقلين
- لا تكتب كلمة "null" كنص — استخدم JSON null

## مخطط JSON المطلوب:
{
  "guest_name": "الاسم الكامل للضيف" أو null,
  "guest_bio": "نبذة قصيرة عن الضيف" أو null
}`

const DETECTION_BATCH_SYSTEM = `أنت محلل بودكاست عربي. مهمتك استخراج اسم الضيف من بيانات الحلقة وكتابة نبذة مختصرة عنه.

المصادر المتاحة لكل حلقة:
- العنوان (title): أهم مصدر — غالباً يذكر اسم الضيف
- الوصف (description): قد يحتوي معلومات إضافية عن الضيف
- مقتطف النص (transcript_snippet): أول 800 حرف من نص الحلقة — قد يكشف اسم الضيف أو تعريفه

القواعد:
- استخرج اسم الضيف الحقيقي الكامل (ليس لقب أو كنية فقط)
- اكتب نبذة مختصرة (2-4 أسطر) بالعربية تصف من هو الضيف ومجاله
- استخدم المقتطف النصي لتحسين النبذة إذا توفر
- إذا كانت الحلقة لا تحتوي على ضيف (مونولوج/المقدم فقط) ضع guest_name: null
- إذا لم تكن متأكداً من الاسم أو هوية الضيف (ثقة أقل من 80%) ضع needs_review: true
- الثقة: "high" = متأكد جداً (الاسم واضح في العنوان)، "medium" = محتمل جداً، "low" = غير متأكد

أنماط شائعة في عناوين البودكاست العربي:
- "مع [اسم الضيف]"
- "[اسم الضيف] |"
- "[اسم الضيف] -"

أرجع النتائج بصيغة JSON:
{
  "results": [
    {
      "episode_id": "...",
      "guest_name": "الاسم الكامل" أو null,
      "guest_bio": "نبذة مختصرة" أو null,
      "confidence": "high" | "medium" | "low",
      "needs_review": true | false
    }
  ]
}`

export interface BuiltGuestExtractPrompt {
  system: string
  user: string
  version: string
  input: Record<string, unknown>
}

export function buildGuestExtractPrompt(input: {
  transcript: string
  videoTitle: string
}): BuiltGuestExtractPrompt {
  return {
    system: EXTRACT_SYSTEM,
    user: `عنوان الحلقة: ${input.videoTitle}\n\nالنص:\n${input.transcript.slice(0, 8000)}`,
    version: GUEST_EXTRACT_PROMPT_VERSION,
    input: { videoTitle: input.videoTitle, transcriptChars: Math.min(input.transcript.length, 8000) },
  }
}

export function buildGuestDetectionBatchPrompt(input: {
  episodesPayload: unknown
  chunkIndex: number
  totalChunks: number
}): BuiltGuestExtractPrompt {
  return {
    system: DETECTION_BATCH_SYSTEM,
    user: JSON.stringify(input.episodesPayload),
    version: GUEST_DETECTION_BATCH_PROMPT_VERSION,
    input: { chunkIndex: input.chunkIndex, totalChunks: input.totalChunks },
  }
}
