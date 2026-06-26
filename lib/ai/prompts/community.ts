/**
 * Khat Brain — community contribution triage prompt.
 *
 * One lightweight structural read over any community submission (guest / topic /
 * question / concept / improvement). Scores quality, classifies, flags spam, and
 * recommends what the operator should do next.
 */

import type { CommunityContribution } from "@/types/database"

export const COMMUNITY_TRIAGE_PROMPT_VERSION = "community-triage-v1.0"

const TYPE_LABEL: Record<string, string> = {
  guest: "اقتراح ضيف",
  topic: "فكرة حلقة",
  question: "سؤال للنقاش",
  concept: "فكرة محتوى",
  improvement: "اقتراح لتحسين البودكاست",
}

const SYSTEM = `أنت محرّر في بودكاست "خط" — بودكاست عربي ثقافي فكري عميق جمهوره في الخليج (السعودية، الكويت، العراق، ودول الخليج)، يقدّر العمق والصدق والقصص الإنسانية لا المحتوى السطحي أو التحفيزي.

تصلك مساهمات من جمهور الموقع: اقتراحات ضيوف، أفكار حلقات، أسئلة للنقاش، أفكار محتوى، أو اقتراحات لتحسين البودكاست. مهمتك فرزها بسرعة وصدق: قيّم جودتها وملاءمتها لهوية خط، وصنّفها، واكشف الرسائل العابثة أو الفارغة، وأوصِ المشغّل بالخطوة التالية.

أعد JSON فقط:
{
  "quality_score": (رقم 0-100 — جودة المساهمة وقيمتها التحريرية لخط),
  "category": (تصنيف تحريري موجز بكلمة أو كلمتين: فلسفة، مجتمع، تقنية، علاقات، تاريخ، اقتصاد، صحة نفسية، ثقافة، دين، أو ما يناسب),
  "ai_summary": (سطر واحد يلخّص جوهر المساهمة للمشغّل),
  "highlights": (مصفوفة نصية — ما يجعلها واعدة؛ فارغة إن لا يوجد),
  "concerns": (مصفوفة نصية — مخاوف أو نواقص؛ فارغة إن لا يوجد),
  "spam": (true إن كانت عابثة/فارغة/مكرّرة/إعلانية/مسيئة، وإلا false),
  "recommended_action": ("advance" تستحق المتابعة | "request_info" واعدة لكن ينقصها وضوح | "nurture" فكرة جيدة نحتفظ بها | "decline" لا تناسب خط),
  "action_rationale": (سطر واحد يبرّر التوصية)
}

كن منصفًا ومشجّعًا للمساهمات الصادقة، وصارمًا مع العابث والفارغ. لا تبالغ في المدح.`

export interface BuiltCommunityPrompt {
  system: string
  user: string
  version: string
  input: Record<string, unknown>
}

export function buildCommunityTriagePrompt(c: CommunityContribution): BuiltCommunityPrompt {
  const detailLines = Object.entries(c.details || {})
    .filter(([, v]) => typeof v === "string" && v.trim())
    .map(([k, v]) => `- ${k}: ${v}`)
    .join("\n")

  const user = `نوع المساهمة: ${TYPE_LABEL[c.type] || c.type}
العنوان: ${c.title}
المحتوى: ${c.body}${detailLines ? `\nتفاصيل إضافية:\n${detailLines}` : ""}

افرز هذه المساهمة وفق صيغة JSON المطلوبة.`

  return {
    system: SYSTEM,
    user,
    version: COMMUNITY_TRIAGE_PROMPT_VERSION,
    input: { contributionId: c.id, type: c.type },
  }
}
