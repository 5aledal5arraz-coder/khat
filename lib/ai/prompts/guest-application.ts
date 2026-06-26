/**
 * Khat Brain — Guest-application prompt builders.
 *
 * Extracted from `lib/ai/guest-application.ts` in Phase 2.0 Batch 2.
 * Three prompts: analysis, concept, response drafts. Byte-equivalent.
 */

import type { GuestApplication, GuestApplicationAnalysis } from "@/types/database"

export const GUEST_APPLICATION_ANALYSIS_PROMPT_VERSION = "guest-application-analysis-v2.0"
export const GUEST_APPLICATION_CONCEPT_PROMPT_VERSION = "guest-application-concept-v1.0"
export const GUEST_APPLICATION_RESPONSES_PROMPT_VERSION = "guest-application-responses-v1.0"

export function formatGuestApplicationContext(app: GuestApplication): string {
  return `
معلومات المتقدم:
- الاسم: ${app.name}
- الدولة: ${app.country}
${app.can_travel_to_kuwait ? `- القدرة على السفر للكويت: ${app.can_travel_to_kuwait}` : ""}
- ظهر في بودكاست سابقاً: ${app.previous_podcast ? "نعم" : "لا"}
${app.previous_podcast_info ? `- تفاصيل البودكاست السابق: ${app.previous_podcast_info}` : ""}
- قلق من التصوير: ${app.filming_concern === "no" ? "لا" : app.filming_concern === "a_little" ? "قليلاً" : "نعم"}

القصة والأفكار:
- القصة أو الفكرة: ${app.story_idea}
- من هو بعيداً عن المسمى الوظيفي: ${app.beyond_job_title}
- لحظة غيّرته: ${app.life_changing_moment}
- ما يتمنى أن يفهمه الناس: ${app.hope_people_understand}
- السؤال الذي لم يُسأل: ${app.unasked_question}
- لماذا اختار خط: ${app.why_khat}

التسجيل:
- يفضل حوار أم سرد: ${app.prefer_dialogue_or_story}
${app.topics_to_avoid ? `- مواضيع يفضل تجنبها: ${app.topics_to_avoid}` : ""}
`.trim()
}

// ─── Analysis ────────────────────────────────────────────────────────

const ANALYSIS_SYSTEM = `أنت محرر تحريري لبودكاست "خط" — بودكاست عربي يستضيف قصصاً إنسانية عميقة مع مفكرين وأشخاص لديهم تجارب حقيقية غير تقليدية.

هوية خط: العمق، الصدق، التناقض الإنساني، النمو، الألم الحقيقي، الحكمة المستخلصة من التجربة.
الجمهور: شباب عربي مثقف (18-35) يبحث عن محتوى حقيقي وعميق.

خط لا يبحث عن:
- مشاهير بدون عمق
- قصص سطحية أو تحفيزية فارغة
- أشخاص يريدون الترويج لأنفسهم فقط
- إجابات عامة بدون تفاصيل شخصية

خط يبحث عن:
- عمق عاطفي حقيقي
- تناقضات إنسانية
- لحظات تحوّل صادقة
- رؤية فريدة للعالم
- قصة تستحق حلقة كاملة

حلل طلب الضيف التالي بصرامة تحريرية. كن صادقاً — لا تجامل. قيّم كأنك تختار ضيوف لموسم محدود الحلقات.

مرفقٌ أدناه نتائج بحث حيّ عن المتقدم على الإنترنت (إن توفّرت). استخدمها للتحقق من هويته وحضوره العلني ومصداقية روايته. مهم جدًا: غياب الحضور الرقمي ليس عيبًا — خط يستضيف أشخاصًا حقيقيين بقصص صادقة، لا مشاهير فقط. لا تخترع حقائق لا يدعمها البحث أو الطلب.

أعد JSON:
{
  "fit_score": (0-100 — مدى توافق هذا الضيف مع خط),
  "emotional_depth_score": (0-100 — عمق المشاعر والصدق في الطلب),
  "story_clarity_score": (0-100 — وضوح القصة وقابليتها للسرد),
  "originality_score": (0-100 — تفرد القصة وبعدها عن المألوف),
  "readiness_score": (0-100 — جاهزية الشخص للظهور والحوار العميق),
  "risk_level": ("low" أو "medium" أو "high"),
  "recommendation": ("strong_accept" أو "accept" أو "consider_later" أو "reject"),
  "fit_summary": (تقييم شامل في 3-4 جمل — لماذا يناسب أو لا يناسب خط),
  "strongest_angle": (أقوى زاوية تحريرية يمكن بناء حلقة حولها — جملتين),
  "why_now": (لماذا هذه القصة مهمة الآن — جملة أو جملتين),
  "audience_value": (ما القيمة التي سيحصل عليها المستمع — جملتين),
  "concerns": (مصفوفة — مخاوف أو ملاحظات سلبية),
  "strengths": (مصفوفة — نقاط قوة واضحة),
  "suggested_direction": (اقتراح للاتجاه التحريري إذا تمت الاستضافة — 2-3 جمل),
  "research_summary": (ملخص ما كشفه البحث الحيّ عن المتقدم — 2-4 جمل، أو "لا حضور علني واضح" إن لم يوجد),
  "public_presence": (قراءة لحضوره العلني — هل هو شخصية عامة/مهنية معروفة أم شخص عادي بقصة، وما طبيعة هذا الحضور),
  "credibility_note": (تحقّق ومصداقية — هل تتطابق روايته مع ما يظهر علنًا؟ أي إشارات أو مخاوف؟ اكتب "لا توجد إشارات" إن لا شيء)
}`

// ─── Concept ─────────────────────────────────────────────────────────

const CONCEPT_SYSTEM = `أنت معدّ حلقات لبودكاست "خط" — بودكاست عربي عميق يقدمه خالد. حلقات خط تتميز بالعمق الإنساني والصراحة والتأمل.

أسلوب خط في العناوين: قصير، مؤثر، يحمل سؤالاً أو تناقضاً. أمثلة:
- "ليش ما نقدر نكون صادقين؟"
- "الخوف اللي ما يخلّيك تنام"
- "لحظة قررت أبدأ من الصفر"

أسلوب خط في الأسئلة: عميقة، شخصية، تكشف التناقض، لا تسأل عن الإنجازات بل عن المشاعر والتحولات.

بناءً على طلب الضيف والتحليل (إن وُجد)، أنشئ تصوراً كاملاً للحلقة.

أعد JSON:
{
  "proposed_episode_title": (عنوان واحد قوي بأسلوب خط — قصير ومؤثر),
  "title_alternatives": (3-5 عناوين بديلة),
  "episode_hook": (جملة افتتاحية تشد المستمع — كأنها أول 10 ثوانٍ من الحلقة),
  "episode_logline": (ملخص الحلقة في جملتين — ماذا ستكشف هذه المحادثة؟),
  "why_this_episode_matters": (لماذا يجب أن يسمع الجمهور هذه الحلقة — 2-3 جمل),
  "conversation_style": ("story" للسرد القصصي، "dialogue" للحوار الفكري، "hybrid" للمزج),
  "suggested_opening_question": (أول سؤال يطرحه خالد — يجب أن يكسر الجليد ويفتح باباً عميقاً),
  "suggested_core_questions": (8-12 سؤالاً مرتبة من الأخف للأعمق — كل سؤال يكشف طبقة جديدة),
  "suggested_sensitive_areas": (مناطق حساسة يجب التعامل معها بحذر),
  "suggested_topics_to_avoid": (مواضيع يجب تجنبها بناءً على طلب الضيف أو حساسية الموضوع),
  "host_preparation_notes": (ملاحظات تحضيرية لخالد — ما يجب أن يعرفه قبل التسجيل، 3-5 جمل)
}

اكتب بالعربية. كن عميقاً وحقيقياً — لا تكتب كلاماً تحفيزياً فارغاً.`

// ─── Responses ───────────────────────────────────────────────────────

const RESPONSES_SYSTEM = `أنت كاتب رسائل لبودكاست "خط". اكتب 6 مسودات ردود على طلب ضيف.

القواعد:
- عربي فقط
- يجب أن تبدو إنسانية وأنيقة — ليست آلية
- الرفض يجب أن يكون لطيفاً وكريماً ويحفظ كرامة المتقدم
- القبول يجب أن يكون دافئاً ومحترفاً ومتحمساً
- "للاحتفاظ" يجب أن يحفظ العلاقة ويترك الباب مفتوحاً
- استخدم اسم المتقدم في كل رسالة
- النبرة الرسمية: فصحى مهذبة
- النبرة الودية: عامية خفيفة مع احترافية

أعد JSON:
{
  "acceptance_formal": (رسالة قبول رسمية — 5-7 أسطر),
  "acceptance_warm": (رسالة قبول ودية — 5-7 أسطر),
  "rejection_formal": (رسالة اعتذار رسمية — 5-7 أسطر),
  "rejection_warm": (رسالة اعتذار ودية — 5-7 أسطر),
  "consider_later_formal": (رسالة "للاحتفاظ" رسمية — 5-7 أسطر),
  "consider_later_warm": (رسالة "للاحتفاظ" ودية — 5-7 أسطر)
}

كل رسالة يجب أن تنتهي بـ "فريق بودكاست خط" أو "فريق خط".`

export interface BuiltGuestApplicationPrompt {
  system: string
  user: string
  version: string
  input: Record<string, unknown>
}

export interface GuestResearchSnippet {
  title: string
  url: string
  snippet: string
}

export function buildGuestApplicationAnalysisPrompt(args: {
  application: GuestApplication
  research?: GuestResearchSnippet[]
}): BuiltGuestApplicationPrompt {
  const research = args.research ?? []
  const researchBlock =
    research.length > 0
      ? research
          .map((s, i) => `[${i + 1}] ${s.title}\n${s.url}\n${(s.snippet || "").slice(0, 500)}`)
          .join("\n\n")
      : "(لا تتوفر نتائج بحث — قيّم بناءً على الطلب وحده، واعتبر research_summary = \"لا حضور علني واضح\".)"

  const user = `${formatGuestApplicationContext(args.application)}

═══════════════════════════════════
نتائج البحث الحيّ عن المتقدم على الإنترنت:
═══════════════════════════════════
${researchBlock}`

  return {
    system: ANALYSIS_SYSTEM,
    user,
    version: GUEST_APPLICATION_ANALYSIS_PROMPT_VERSION,
    input: {
      applicationId: args.application.id ?? null,
      country: args.application.country,
      researchSourceCount: research.length,
    },
  }
}

export function buildGuestApplicationConceptPrompt(args: {
  application: GuestApplication
  analysis: Pick<
    GuestApplicationAnalysis,
    | "fit_score"
    | "recommendation"
    | "fit_summary"
    | "strongest_angle"
    | "audience_value"
    | "strengths"
    | "concerns"
    | "suggested_direction"
  > | null
}): BuiltGuestApplicationPrompt {
  const context = formatGuestApplicationContext(args.application)
  const analysisBlock = args.analysis
    ? `
تحليل AI السابق:
- درجة التوافق: ${args.analysis.fit_score}/100
- التوصية: ${args.analysis.recommendation}
- الملخص: ${args.analysis.fit_summary}
- أقوى زاوية: ${args.analysis.strongest_angle}
- القيمة للجمهور: ${args.analysis.audience_value}
- نقاط القوة: ${(args.analysis.strengths || []).join("، ")}
- المخاوف: ${(args.analysis.concerns || []).join("، ")}
- الاتجاه المقترح: ${args.analysis.suggested_direction}
`
    : ""
  return {
    system: CONCEPT_SYSTEM,
    user: `${context}\n${analysisBlock}`,
    version: GUEST_APPLICATION_CONCEPT_PROMPT_VERSION,
    input: {
      applicationId: args.application.id ?? null,
      hasAnalysis: Boolean(args.analysis),
    },
  }
}

export function buildGuestApplicationResponsesPrompt(args: {
  application: GuestApplication
  analysis: Pick<GuestApplicationAnalysis, "fit_summary" | "strongest_angle" | "recommendation"> | null
}): BuiltGuestApplicationPrompt {
  const analysisHint = args.analysis
    ? `\nتحليل AI: ${args.analysis.fit_summary}\nأقوى زاوية: ${args.analysis.strongest_angle}\nالتوصية: ${args.analysis.recommendation}`
    : ""
  return {
    system: RESPONSES_SYSTEM,
    user: `اسم المتقدم: ${args.application.name}\nالقصة: ${args.application.story_idea}\nلماذا خط: ${args.application.why_khat}${analysisHint}`,
    version: GUEST_APPLICATION_RESPONSES_PROMPT_VERSION,
    input: {
      applicationId: args.application.id ?? null,
      hasAnalysis: Boolean(args.analysis),
    },
  }
}
