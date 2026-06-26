/**
 * Khat Brain — Sponsorship prompt builders.
 *
 * Extracted from `lib/ai/sponsorship.ts` in Phase 2.0 Batch 2.
 * Two prompts: lead analysis (structural) + proposal (editorial).
 */

import type { SponsorshipLead, SponsorshipAnalysis } from "@/types/database"

export const SPONSORSHIP_ANALYSIS_PROMPT_VERSION = "partnership-evaluation-v2.0"
export const SPONSORSHIP_PROPOSAL_PROMPT_VERSION = "sponsorship-proposal-v2.0"

// ─── Evaluation (live research + full company assessment) ──────────────

const EVALUATION_SYSTEM = `أنت لجنة تحريرية واستراتيجية متمرّسة تقيّم طلبات الشراكة لبودكاست "خط" — بودكاست عربي ثقافي فكري عميق.

عن خط:
- جمهوره الأساسي في الخليج: السعودية والكويت والعراق ودول الخليج — صنّاع قرار ومهنيون شباب مثقفون (18–35).
- قيمه: العمق، الأصالة، الجودة، والاستقلالية التحريرية الكاملة. خط لا يقايض مصداقيته بإعلان.
- الشراكة مع خط حضورٌ داخل محتوى موثوق، لا فاصل إعلاني.

مهمتك: تقييم الشركة كشريك محتمل تقييماً شاملاً وصادقاً، مستندًا إلى (أ) كامل بيانات الطلب، و(ب) نتائج البحث الحيّ عن الشركة على الإنترنت المرفقة أدناه. استخدم البحث لتقييم المنتجات والسمعة والمكانة والجمهور — ولا تخترع حقائق لا يدعمها البحث أو الطلب؛ وإن نقصت المعلومة قُل ذلك صراحةً.

أعد تقييمك بصيغة JSON فقط:
{
  "research_summary": (ملخص ما كشفه البحث عن الشركة — 3-5 جمل، أو "لا تتوفر نتائج بحث كافية" إن لم يوجد),
  "products_summary": (ماذا تقدّم الشركة فعلاً — منتجات/خدمات),
  "reputation": (سمعتها، الانطباع العام، وأي جدل أو مخاوف ظهرت),
  "market_position": (مكانتها في السوق — حجمها، منافسوها، أين تقف),
  "audience_summary": (جمهور الشركة ومدى تقاطعه مع جمهور خط الخليجي),
  "intent_summary": (نية الشريك من الشراكة — جملتان),
  "fit_score": (رقم 0-100 — مدى ملاءمتها كشريك لخط),
  "fit_verdict": ("strong_fit" | "possible_fit" | "weak_fit" | "not_recommended"),
  "fit_reasoning": (لماذا هي مناسبة أو غير مناسبة لخط تحديدًا — صريح ومباشر، 3-5 جمل),
  "quality": ("high" | "medium" | "low"),
  "risk_level": ("low" | "medium" | "high"),
  "risk_flags": (مصفوفة نصية — مخاطر أو تعارضات قيمية أو مخاوف على المصداقية؛ فارغة إن لا يوجد),
  "opportunity_highlights": (مصفوفة نصية — نقاط قوة وفرص حقيقية),
  "budget_fit": ("good" | "weak" | "unclear"),
  "recommended_structure": (هيكل الشراكة الأنسب — أي شكل/باقة ولماذا، جملتان),
  "recommended_episodes": (رقم — عدد الحلقات المقترح للشراكة),
  "recommended_package": (اسم مختصر للباقة المقترحة),
  "pricing_strategy": (استراتيجية تسعير مقترحة — المنهج لا رقمًا ثابتًا: كيف نسعّر بناءً على القيمة والميزانية والمكانة),
  "recommended_action": ("advance" المضي لعرض | "request_info" نحتاج معلومات أكثر | "nurture" مناسب لكن ليس الآن | "decline" نعتذر بلطف),
  "action_rationale": (سطر واحد يبرّر الإجراء الموصى به — لماذا هذا هو التصرف الأنسب الآن),
  "reasoning": (خلاصة موجزة تربط التقييم بالتوصية — 2-3 جمل)
}

كن موضوعيًا ودقيقًا. لا تبالغ مدحًا ولا قدحًا. حماية مصداقية خط أولوية: لو كانت الشركة لا تناسب قيم خط، قُلها بوضوح.`

export interface ResearchSnippet {
  title: string
  url: string
  snippet: string
}

export interface PartnershipEvaluationPromptInput {
  lead: SponsorshipLead
  research: ResearchSnippet[]
}

export interface BuiltSponsorshipPrompt {
  system: string
  user: string
  version: string
  input: Record<string, unknown>
}

function leadDossier(lead: SponsorshipLead): string {
  const line = (label: string, v: string | null | undefined) =>
    v && v.trim() ? `- ${label}: ${v}` : null
  return [
    "معلومات الشركة:",
    line("الشركة", lead.company_name),
    line("المجال", lead.industry),
    line("الموقع الإلكتروني", lead.company_website),
    line("المسؤول", `${lead.contact_name} (${lead.job_title})`),
    "",
    "العلامة والجمهور:",
    line("قيم العلامة ورسالتها", lead.brand_values),
    line("الجمهور المستهدف", lead.target_audience),
    line("أنواع التعاون المطلوبة", lead.collaboration_types.join("، ")),
    "",
    "الأهداف والتوقعات:",
    line("الهدف الرئيسي", lead.main_goal),
    line("مؤشرات النجاح / أهداف الحملة", lead.campaign_goals),
    line("ما يتوقعونه من خط", lead.expectations),
    line("الإطار الزمني", lead.preferred_timeline),
    "",
    "الخبرة والميزانية:",
    line("خبرة شراكات سابقة", lead.previous_partnerships),
    line("نطاق الميزانية", lead.budget_range),
    line("معلومات إضافية", lead.additional_info),
  ]
    .filter((x) => x !== null)
    .join("\n")
}

export function buildPartnershipEvaluationPrompt(
  input: PartnershipEvaluationPromptInput,
): BuiltSponsorshipPrompt {
  const { lead, research } = input
  const researchBlock =
    research.length > 0
      ? research
          .map(
            (s, i) =>
              `[${i + 1}] ${s.title}\n${s.url}\n${(s.snippet || "").slice(0, 600)}`,
          )
          .join("\n\n")
      : "(لا تتوفر نتائج بحث — قيّم بناءً على بيانات الطلب فقط، واذكر أن البحث غير متاح.)"

  const user = `${leadDossier(lead)}

═══════════════════════════════════
نتائج البحث الحيّ عن الشركة على الإنترنت:
═══════════════════════════════════
${researchBlock}

قيّم هذه الشركة كشريك محتمل لخط وفق صيغة JSON المطلوبة.`

  return {
    system: EVALUATION_SYSTEM,
    user,
    version: SPONSORSHIP_ANALYSIS_PROMPT_VERSION,
    input: {
      leadId: lead.id ?? null,
      companyName: lead.company_name,
      industry: lead.industry,
      budgetRange: lead.budget_range,
      researchSourceCount: research.length,
    },
  }
}

// ─── Proposal ────────────────────────────────────────────────────────

export interface SponsorshipProposalPromptInput {
  lead: SponsorshipLead
  analysis: Pick<
    SponsorshipAnalysis,
    | "fit_score"
    | "quality"
    | "intent_summary"
    | "budget_fit"
    | "recommended_package"
    | "opportunity_highlights"
    | "fit_reasoning"
    | "market_position"
    | "audience_summary"
    | "recommended_structure"
    | "recommended_episodes"
    | "pricing_strategy"
  > | null
  tone: "formal" | "warm"
}

function buildProposalSystem(toneLabel: string): string {
  return `أنت كاتب عروض شراكات محترف لبودكاست "خط" — بودكاست عربي ثقافي فكري عميق جمهوره الأساسي في الخليج (السعودية، الكويت، العراق، ودول الخليج).

عن البودكاست:
- يستضيف مفكرين وقادة رأي ويقدّم محتوى عميق دائم القيمة.
- المنصات: يوتيوب، سبوتيفاي، أبل بودكاست، تيك توك، إنستغرام.
- القيم: العمق، الأصالة، الجودة، والاستقلالية التحريرية الكاملة.
- الشراكة حضورٌ داخل محتوى موثوق، لا فاصل إعلاني.

اكتب عرض شراكة احترافيًا مخصّصًا للشريك المحتمل. استند إلى تقييم الذكاء الاصطناعي المرفق (الهيكل المقترح وعدد الحلقات واستراتيجية التسعير) إن وُجد.
النبرة المطلوبة: ${toneLabel}

أعد الإجابة بصيغة JSON:
{
  "subject": (عنوان البريد — قصير وجذاب),
  "greeting": (تحية مخصصة باسم المسؤول),
  "introduction": (لماذا نحن متحمسون لهذه الشراكة تحديدًا — مربوط بعلامتهم),
  "value_proposition": (ماذا يقدّم خط لهم وكيف يخدم أهدافهم — 3-4 جمل),
  "proposed_packages": [
    {
      "name": (اسم الباقة),
      "description": (وصف يربط الباقة بأهدافهم),
      "price_range": (إن لزم: إشارة لنطاق/منهج التسعير، أو "يُحدّد بعد المواءمة"),
      "deliverables": [(قائمة المخرجات الملموسة)]
    }
  ],
  "next_steps": (الخطوات التالية — جملتان),
  "closing": (خاتمة مهنية),
  "full_draft": (العرض الكامل مجمّعًا كرسالة احترافية متكاملة جاهزة — هذا هو المقترح الكامل),
  "reply_email": (رسالة قصيرة ودّية ومهنية جاهزة للإرسال مباشرةً للشركة كردّ أولي يقدّم المقترح — 4-6 أسطر فقط)
}

قدّم 2-3 باقات متدرجة تنطلق من الهيكل المقترح. اجعل التسعير متّسقًا مع استراتيجية التسعير والميزانية. اكتب بالعربية الفصحى. كن مقنعًا دون مبالغة.`
}

export function buildSponsorshipProposalPrompt(
  input: SponsorshipProposalPromptInput,
): BuiltSponsorshipPrompt {
  const { lead, analysis, tone } = input
  const toneLabel = tone === "formal" ? "رسمي ومهني" : "ودّي ودافئ مع احترافية"
  const analysisBlock = analysis
    ? `
تقييم الذكاء الاصطناعي (استند إليه):
- درجة التوافق: ${analysis.fit_score}/100 (${analysis.quality})
- ملخص النية: ${analysis.intent_summary}
- لماذا تناسب خط: ${analysis.fit_reasoning ?? "—"}
- مكانتها في السوق: ${analysis.market_position ?? "—"}
- تقاطع الجمهور: ${analysis.audience_summary ?? "—"}
- الهيكل المقترح: ${analysis.recommended_structure ?? analysis.recommended_package ?? "—"}
- عدد الحلقات المقترح: ${analysis.recommended_episodes ?? "—"}
- استراتيجية التسعير: ${analysis.pricing_strategy ?? "—"}
- تقييم الميزانية: ${analysis.budget_fit}
- نقاط القوة: ${(analysis.opportunity_highlights || []).join("، ")}
`
    : ""

  const user = `بيانات الشريك المحتمل:
- الشركة: ${lead.company_name}
- المجال: ${lead.industry}
- المسؤول: ${lead.contact_name} (${lead.job_title})
- قيم العلامة: ${lead.brand_values ?? "—"}
- أنواع التعاون: ${lead.collaboration_types.join("، ")}
- الهدف: ${lead.main_goal}
- أهداف الحملة: ${lead.campaign_goals ?? "—"}
- توقعاتهم: ${lead.expectations ?? "—"}
- الجمهور المستهدف: ${lead.target_audience}
- الميزانية: ${lead.budget_range}
${lead.preferred_timeline ? `- الجدول الزمني: ${lead.preferred_timeline}` : ""}
${lead.additional_info ? `- معلومات إضافية: ${lead.additional_info}` : ""}
${analysisBlock}`

  return {
    system: buildProposalSystem(toneLabel),
    user,
    version: SPONSORSHIP_PROPOSAL_PROMPT_VERSION,
    input: {
      leadId: lead.id ?? null,
      tone,
      hasAnalysis: Boolean(analysis),
    },
  }
}
