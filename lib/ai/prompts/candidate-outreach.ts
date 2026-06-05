/**
 * Khat Brain — Candidate-outreach prompt builder.
 *
 * Extracted from `lib/guest-candidates/outreach.ts` in Phase 2.0
 * Batch 2. Byte-equivalent system + user builders.
 */

import type { guestCandidates as guestCandidatesTable } from "@/lib/db/schema/guest-candidates"
import type { OutreachChannel, OutreachTone } from "@/types/database"

export const CANDIDATE_OUTREACH_PROMPT_VERSION = "candidate-outreach-v1.0"

const TONE_LABELS: Record<OutreachTone, string> = {
  formal: "رسمي محترم",
  warm: "دافئ ودود",
  concise: "موجز ومباشر",
  premium: "راقي وأنيق",
}

const CHANNEL_LABELS: Record<OutreachChannel, string> = {
  whatsapp: "WhatsApp",
  email: "بريد إلكتروني",
  dm: "رسالة مباشرة على منصة اجتماعية",
}

const LENGTH_GUIDE = {
  short: "قصيرة جداً (سطرين-ثلاثة)",
  medium: "متوسطة (4-6 أسطر)",
  long: "مفصلة (فقرة كاملة)",
}

export function buildCandidateOutreachSystem(
  channel: OutreachChannel,
  tone: OutreachTone,
  length: "short" | "medium" | "long",
): string {
  const needsSubject = channel === "email"
  return `أنت كاتب رسائل احترافي يعمل لصالح بودكاست عربي عميق اسمه "خط".
"خط" بودكاست ثقافي يستضيف شخصيات مؤثرة لمحاورات صادقة وعميقة.

مهمتك: كتابة رسالة دعوة شخصية لمرشح محتمل ليكون ضيفاً في البودكاست.

القناة: ${CHANNEL_LABELS[channel]}
النبرة: ${TONE_LABELS[tone]}
الطول: ${LENGTH_GUIDE[length]}

المبادئ:
- اكتب بالعربية الفصحى المفهومة (ليست المعقدة)
- خاطب المرشح باسمه واذكر شيئاً محدداً عنه (ليست رسالة جماعية مكررة)
- اشرح لماذا هو/هي تحديداً قد يكون ضيفاً مميزاً
- لا تكن مبتذلاً أو متملقاً
- اختم بدعوة واضحة (مكالمة قصيرة، رد بسيط بنعم/لا، إلخ)
- لا تذكر مدة الحلقة ولا الحوافز المالية ولا التفاصيل اللوجستية
- لا تستخدم رموز إيموجي
- ${needsSubject ? "ابدأ بسطر موضوع جذاب وقصير" : "لا تكتب سطر موضوع — اكتب نص الرسالة مباشرة"}

أرجع الناتج كـ JSON بهذه البنية فقط:
${needsSubject ? `{
  "subject_line": "string",
  "message_body": "string"
}` : `{
  "subject_line": null,
  "message_body": "string"
}`}`
}

export function buildCandidateOutreachUser(
  candidate: typeof guestCandidatesTable.$inferSelect,
  socials: { platform: string; url: string }[],
  customNote?: string,
): string {
  const lines: string[] = []
  lines.push(`اسم المرشح: ${candidate.full_name}`)
  if (candidate.display_name && candidate.display_name !== candidate.full_name) {
    lines.push(`الاسم الظاهر: ${candidate.display_name}`)
  }
  if (candidate.category) lines.push(`المجال: ${candidate.category}`)
  if (candidate.bio) {
    lines.push("")
    lines.push(`نبذة:`)
    lines.push(candidate.bio)
  }

  if (candidate.ai_summary) {
    lines.push("")
    lines.push(`تحليل سابق:`)
    lines.push(candidate.ai_summary)
  }
  if (candidate.ai_reason_to_invite) {
    lines.push("")
    lines.push(`سبب الدعوة المقترح: ${candidate.ai_reason_to_invite}`)
  }
  if (candidate.ai_topics_json && candidate.ai_topics_json.length > 0) {
    lines.push("")
    lines.push(`مواضيع محتملة للحوار: ${candidate.ai_topics_json.slice(0, 5).join("، ")}`)
  }

  if (socials.length > 0) {
    lines.push("")
    lines.push(`روابط:`)
    for (const s of socials) lines.push(`- ${s.platform}: ${s.url}`)
  }

  if (customNote && customNote.trim()) {
    lines.push("")
    lines.push(`ملاحظة من فريق الإنتاج:`)
    lines.push(customNote.trim())
  }

  lines.push("")
  lines.push("اكتب رسالة الدعوة الآن. أرجع JSON فقط.")
  return lines.join("\n")
}
