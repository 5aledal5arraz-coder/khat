/**
 * Khat Brain — Discovery candidate-verification prompt builder.
 *
 * Extracted from lib/discovery/verify-candidate.ts in Phase 0. The
 * system prompt is the Arabic editorial-investigator brief; the user
 * block assembles archetype + proposal + evidence URLs.
 *
 * Byte-equivalent to the previous inline code.
 */

import type {
  DiscoveryArchetype,
  DiscoveryEvidenceUrl,
} from "@/lib/discovery/types"

export const DISCOVERY_VERIFY_PROMPT_VERSION = "discovery-verify-v2.0"

const SYSTEM_PROMPT_BASE = `أنت محقق تحريري لبودكاست خط. مهمتك: تحقق إن كان هذا الشخص يستحق أن يُدعى إلى الحلقة.

## ما تتلقاه:
- نمط بشري (archetype) — نوع الإنسان الذي نبحث عنه
- اقتراح ضيف (اسم/دور/بلد قد تكون فارغة)
- روابط أدلة (عناوين + مقتطفات قصيرة من المنصات)
- (اختياري) فلاتر صارمة من الموسم — الجنس و/أو الجنسية المطلوبة

## ما تفعله:
1. اقرأ الأدلة بعناية. لا تخترع.
2. ابحث عن إشارات النمط في الأدلة فعلياً.
3. إن كانت الإشارات قوية، لخّص لماذا يهم هذا الشخص.
4. إن كانت ضعيفة أو مضللة، اشرح بصراحة (red_flags).
5. حدّد جنس الضيف وجنسيّته من الأدلة فقط. إذا لم تستطع التحقق بثقة، استخدم "unknown".

## مخرجك (JSON فقط):
{
  "evidence_summary": {
    "why_they_matter": "جملتان تشرحان لماذا قد يكون ضيفاً قيّماً (أو لماذا لا)",
    "topics": ["موضوع 1", "موضوع 2"],
    "risks": ["مخاطر تحريرية محتملة"],
    "notable_quotes": ["اقتباس أو فكرة لاحظتها في الأدلة"],
    "red_flags": ["إشارات تحذيرية"]
  },
  "story_signals": {
    "arcs": ["نمط قصصي 1"],
    "topics": ["موضوع رئيسي"],
    "events": ["حدث / تحوّل ملموس مذكور في الأدلة"]
  },
  "editorial_fit_score": 0.0_to_1.0,
  "inferred_gender": "male" | "female" | "unknown",
  "inferred_nationality": "kuwaiti" | "non_kuwaiti" | "unknown",
  "general_rationale": "جملتان بالعربية — لماذا هذا الشخص يستحق الدعوة بشكل عام",
  "topic_fit_rationale": "جملتان بالعربية — لماذا يناسب موضوع الحلقة المحددة تحديداً. إن لم يكن هناك موضوع حلقة، اتركها null",
  "topic_fit_score": 0.0_to_1.0,
  "social_links": {
    "youtube_channel": "https://...",
    "twitter": "https://...",
    "instagram": "https://...",
    "linkedin": "https://...",
    "tiktok": "https://...",
    "facebook": "https://...",
    "website": "https://..."
  }
}

## قواعد الـ social_links:
- استخرج فقط روابط الصفحات الرسمية / الحسابات (handles / channels / official site).
- لا تضع روابط مقالات / فيديوهات فردية / نتائج بحث — هذه تبقى في evidence_urls.
- إذا لم تجد رابطاً لمنصة، احذف المفتاح (لا تضع null أو سلسلة فارغة).
- topic_fit_score = 0 إذا لم يكن هناك سياق حلقة، أو إذا لم تجد رابط واضح بين هذا الشخص والموضوع.

## مهم:
- إن لم تجد إشارات قوية في الأدلة → editorial_fit_score منخفض
- إن لم يكن لديك سياق كافٍ → اعترف بذلك بدلاً من الاختلاق
- لا تستخدم عدد المتابعين كإشارة رئيسية
- "unknown" مقبول للجنس أو الجنسية إذا لم تتمكّن من التحقق — لا تخمّن`

export interface DiscoveryVerifyPromptInput {
  archetype: DiscoveryArchetype
  proposedName?: string | null
  proposedRole?: string | null
  proposedCountry?: string | null
  evidenceUrls: DiscoveryEvidenceUrl[]
  /**
   * Phase B redesign — strict guest filters from the season. Surfaced
   * in the user block so the model knows what it's being asked to
   * confirm.
   */
  filters?: {
    gender?: "male" | "female"
    nationality?: "kuwaiti" | "non_kuwaiti"
  }
  /**
   * Phase B redesign — episode topic context. When passed, the verifier
   * is asked to compute `topic_fit_rationale` and `topic_fit_score`
   * against this specific episode.
   */
  episodeContext?: {
    workingTitle: string
    topicDomain?: string | null
  }
}

export interface BuiltDiscoveryVerifyPrompt {
  system: string
  user: string
  version: string
}

export function buildDiscoveryVerifyPrompt(
  input: DiscoveryVerifyPromptInput,
): BuiltDiscoveryVerifyPrompt {
  const evidenceBlock = input.evidenceUrls
    .map(
      (e, i) =>
        `### دليل ${i + 1} — ${e.platform}\n` +
        `URL: ${e.url}\n` +
        (e.title ? `Title: ${e.title}\n` : "") +
        (e.snippet ? `Snippet: ${e.snippet}\n` : ""),
    )
    .join("\n")

  const filterBlock = input.filters
    ? `\n## فلاتر الموسم الصارمة (يجب التحقق منها من الأدلة):
${input.filters.gender ? `- الجنس المطلوب: ${input.filters.gender}` : ""}
${input.filters.nationality ? `- الجنسية المطلوبة: ${input.filters.nationality === "kuwaiti" ? "كويتي" : "غير كويتي"}` : ""}
ملاحظة: إذا لم تستطع التحقق من الجنس أو الجنسية من الأدلة، استخدم "unknown" — لا تخمّن.\n`
    : ""

  const episodeBlock = input.episodeContext
    ? `\n## موضوع الحلقة المُستهدفة (لحساب topic_fit_rationale و topic_fit_score):
- العنوان: ${input.episodeContext.workingTitle}
${input.episodeContext.topicDomain ? `- المجال: ${input.episodeContext.topicDomain}` : ""}
\n`
    : ""

  const user = `## النمط البشري:
${JSON.stringify(input.archetype, null, 2)}

## الاقتراح:
- الاسم: ${input.proposedName ?? "غير معروف"}
- الدور: ${input.proposedRole ?? "غير معروف"}
- البلد: ${input.proposedCountry ?? "غير معروف"}
${filterBlock}${episodeBlock}
## الأدلة:
${evidenceBlock || "(لا توجد أدلة)"}

أجب بتنسيق JSON فقط.`

  return {
    system: SYSTEM_PROMPT_BASE,
    user,
    version: DISCOVERY_VERIFY_PROMPT_VERSION,
  }
}
