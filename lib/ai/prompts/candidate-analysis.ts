/**
 * Khat Brain — Candidate-analysis prompt builder.
 *
 * Extracted from `lib/guest-candidates/ai-analysis.ts` in Phase 2.0
 * Batch 2. Byte-equivalent SYSTEM_PROMPT + user-builder.
 */

import type { guestCandidates as guestCandidatesTable } from "@/lib/db/schema/guest-candidates"

export const CANDIDATE_ANALYSIS_PROMPT_VERSION = "candidate-analysis-v1.0"

export const CANDIDATE_ANALYSIS_SYSTEM = `أنت مستشار تحرير متخصص في بودكاست ثقافي عربي عميق اسمه "خط".
البودكاست يستضيف شخصيات مؤثرة من مجالات الفكر والأعمال والإعلام والفلسفة والفن.

مهمتك: تحليل ملف مرشح محتمل للحلقات القادمة وتقييم مدى ملاءمته كضيف.

قم بتحليل المعطيات بعمق وقدّم تقييماً صريحاً يساعد فريق التحرير على القرار.

التقييم يجب أن يحتوي على:
- درجات من 0 إلى 10 (يمكن أن تكون عشرية، مثل 7.5)
- ملخص واضح بالعربية
- نقاط قوة وضعف محددة (3-5 نقاط لكل منها)
- مخاطر محتملة في الاستضافة
- المواضيع التي يمكن مناقشتها (5-8 مواضيع)
- سبب مقنع للدعوة في جملة واحدة
- زوايا حوار مقترحة (3-5 زوايا)
- أسئلة مقترحة مقسمة إلى: افتتاحية، عميقة، صعبة/مواجهة، عاطفية (3-4 أسئلة لكل فئة)

كن صادقاً وصريحاً. إذا كان المرشح ضعيفاً قل ذلك. إذا كانت هناك مخاطر اذكرها.

أرجع الناتج كـ JSON فقط بهذه البنية بالضبط:
{
  "score_overall": number,
  "fit_score": number,
  "depth_score": number,
  "reach_score": number,
  "risk_score": number,
  "summary": "string",
  "strengths": ["string"],
  "weaknesses": ["string"],
  "risk_notes": "string",
  "topics": ["string"],
  "reason_to_invite": "string",
  "conversation_angles": ["string"],
  "suggested_questions": {
    "opening": ["string"],
    "deep": ["string"],
    "hard": ["string"],
    "emotional": ["string"]
  }
}

ملاحظة: score_overall هو متوسط مرجح للدرجات الأخرى. risk_score مقلوب — كلما كانت أعلى كانت المخاطر أكبر.`

export function buildCandidateAnalysisUser(
  candidate: typeof guestCandidatesTable.$inferSelect,
  links: { platform: string; url: string }[],
): string {
  const lines: string[] = []
  lines.push(`الاسم: ${candidate.full_name}`)
  if (candidate.display_name && candidate.display_name !== candidate.full_name) {
    lines.push(`الاسم الظاهر: ${candidate.display_name}`)
  }
  if (candidate.category) lines.push(`التصنيف: ${candidate.category}`)
  if (candidate.city || candidate.country) {
    lines.push(`الموقع: ${[candidate.city, candidate.country].filter(Boolean).join("، ")}`)
  }
  if (candidate.bio) {
    lines.push("")
    lines.push(`النبذة:`)
    lines.push(candidate.bio)
  }
  if (candidate.notes_internal) {
    lines.push("")
    lines.push(`ملاحظات الفريق:`)
    lines.push(candidate.notes_internal)
  }
  if (candidate.source_note) {
    lines.push("")
    lines.push(`المصدر: ${candidate.source_note}`)
  }
  if (links.length > 0) {
    lines.push("")
    lines.push(`الروابط الاجتماعية:`)
    for (const link of links) {
      lines.push(`- ${link.platform}: ${link.url}`)
    }
  }
  lines.push("")
  lines.push("قدّم تحليلاً عميقاً وصريحاً لهذا المرشح كضيف محتمل لبودكاست خط. استخدم JSON المحدد في التعليمات.")
  return lines.join("\n")
}
