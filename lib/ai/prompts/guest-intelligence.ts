/**
 * Khat Brain — Guest-intelligence prompt builder.
 *
 * Extracted from `lib/ai/guest-intelligence.ts::generateGuestIntelligence`
 * in Phase 2.0 Batch 2. Byte-equivalent to the previous inline prompt.
 * Do NOT edit the prompt body without bumping VERSION.
 */

export const GUEST_INTELLIGENCE_PROMPT_VERSION = "guest-intelligence-v1.0"

export interface GuestIntelligencePromptInput {
  preparedTranscript: string
  videoTitle: string
  intelligenceBlock: string
  hasIntelligence: boolean
}

export interface BuiltGuestIntelligencePrompt {
  system: string
  user: string
  version: string
  input: Record<string, unknown>
}

export function buildGuestIntelligencePrompt(
  input: GuestIntelligencePromptInput,
): BuiltGuestIntelligencePrompt {
  const system = `أنت محلل ذكي متخصص في تحليل الضيوف في البودكاست العربي. مهمتك استخراج ملف شامل عن الضيف.

${input.hasIntelligence ? "⚠️ لديك فهم شامل مسبق للحلقة بما فيه ملف الضيف. حسّنه وأضف تفاصيل من النص." : ""}

## المطلوب:
أعد JSON بالبنية التالية:

{
  "detected_name": "الاسم الكامل للضيف" أو null,
  "detected_bio": "نبذة مفصّلة عن الضيف (3-5 أسطر)" أو null,
  "confidence_score": 0.0 إلى 1.0,
  "speaking_style": "وصف أسلوب الضيف في الحديث (رسمي/عفوي/أكاديمي/ساخر/...)",
  "key_positions": ["موقف 1 يتبناه الضيف", "موقف 2"],
  "notable_quotes": [{"text": "الاقتباس", "context": "سياق الاقتباس"}]
}

## إرشادات:
- استخرج الاسم الكامل (وليس لقب أو كنية فقط)
- اكتب النبذة بناءً على ما ذُكر في الحلقة فقط
- confidence_score: 1.0 = متأكد تماماً، 0.5 = محتمل، 0.0 = لا يوجد ضيف
- حدد أسلوب الضيف في الكلام بدقة
- استخلص مواقف الضيف الواضحة (ما يؤمن به، ما يدافع عنه)
- اختر 3-5 اقتباسات مؤثرة مع سياقها
- إذا لم يكن هناك ضيف (حلقة مونولوج)، أعد null مع confidence_score: 0.0`

  const user = `عنوان الحلقة: ${input.videoTitle}
${input.intelligenceBlock}
النص:
${input.preparedTranscript}`

  return {
    system,
    user,
    version: GUEST_INTELLIGENCE_PROMPT_VERSION,
    input: {
      videoTitle: input.videoTitle,
      hasIntelligence: input.hasIntelligence,
      transcriptChars: input.preparedTranscript.length,
    },
  }
}
