/**
 * Khat Brain — Sponsorship prompt builders.
 *
 * Extracted from `lib/ai/sponsorship.ts` in Phase 2.0 Batch 2.
 * Two prompts: lead analysis (structural) + proposal (editorial).
 */

import type { SponsorshipLead, SponsorshipAnalysis } from "@/types/database"

export const SPONSORSHIP_ANALYSIS_PROMPT_VERSION = "sponsorship-analysis-v1.0"
export const SPONSORSHIP_PROPOSAL_PROMPT_VERSION = "sponsorship-proposal-v1.0"

// ─── Analysis ────────────────────────────────────────────────────────

const ANALYSIS_SYSTEM = `أنت محلل شراكات متخصص في تقييم طلبات الرعاية لبودكاست "خط" — بودكاست عربي ثقافي فكري يستضيف مفكرين وقادة رأي.

جمهور البودكاست: شباب عربي مثقف (18-35)، مهتم بالفكر والثقافة والتطوير الذاتي.
قيم البودكاست: العمق، الأصالة، الجودة، عدم التنازل عن المحتوى لصالح الإعلان.

حلل طلب الشراكة التالي وقدم تقييماً شاملاً بصيغة JSON:

{
  "fit_score": (رقم 0-100 — مدى توافق الشريك مع البودكاست),
  "quality": ("high" أو "medium" أو "low"),
  "risk_level": ("low" أو "medium" أو "high"),
  "intent_summary": (ملخص واضح لنية الشريك في 2-3 جمل),
  "budget_fit": ("good" أو "weak" أو "unclear"),
  "recommended_package": (اقتراح نوع الشراكة الأنسب — جملة أو جملتين),
  "reasoning": (تبرير التقييم — 3-4 جمل),
  "risk_flags": (مصفوفة نصية — مخاطر أو ملاحظات سلبية، فارغة إذا لا يوجد),
  "opportunity_highlights": (مصفوفة نصية — نقاط قوة وفرص)
}

كن موضوعياً ودقيقاً. لا تبالغ في التقييم الإيجابي أو السلبي.`

export interface SponsorshipAnalysisPromptInput {
  lead: SponsorshipLead
}

export interface BuiltSponsorshipPrompt {
  system: string
  user: string
  version: string
  input: Record<string, unknown>
}

export function buildSponsorshipAnalysisPrompt(
  input: SponsorshipAnalysisPromptInput,
): BuiltSponsorshipPrompt {
  const { lead } = input
  const user = `
معلومات الشركة:
- الشركة: ${lead.company_name}
- المجال: ${lead.industry}
- المسؤول: ${lead.contact_name} (${lead.job_title})
- البريد: ${lead.email}
- الهاتف: ${lead.phone}

تفاصيل التعاون:
- أنواع التعاون المطلوبة: ${lead.collaboration_types.join("، ")}
${lead.collaboration_other ? `- تفاصيل إضافية: ${lead.collaboration_other}` : ""}

الأهداف:
- الهدف الرئيسي: ${lead.main_goal}
- الجمهور المستهدف: ${lead.target_audience}
${lead.preferred_timeline ? `- الجدول الزمني: ${lead.preferred_timeline}` : ""}

الميزانية:
- النطاق: ${lead.budget_range}
${lead.additional_info ? `\nمعلومات إضافية:\n${lead.additional_info}` : ""}
`.trim()

  return {
    system: ANALYSIS_SYSTEM,
    user,
    version: SPONSORSHIP_ANALYSIS_PROMPT_VERSION,
    input: {
      leadId: lead.id ?? null,
      companyName: lead.company_name,
      industry: lead.industry,
      budgetRange: lead.budget_range,
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
  > | null
  tone: "formal" | "warm"
}

function buildProposalSystem(toneLabel: string): string {
  return `أنت كاتب عروض شراكات محترف لبودكاست "خط" — بودكاست عربي ثقافي فكري.

عن البودكاست:
- بودكاست خط يستضيف مفكرين وقادة رأي ويقدم محتوى عميق
- الجمهور: شباب عربي مثقف (18-35)
- المنصات: يوتيوب، سبوتيفاي، أبل بودكاست، تيك توك، إنستغرام
- القيم: العمق، الأصالة، الجودة

اكتب عرض شراكة مخصص بناءً على بيانات الشريك المحتمل.
النبرة المطلوبة: ${toneLabel}

أعد الإجابة بصيغة JSON:
{
  "subject": (عنوان البريد الإلكتروني — قصير وجذاب),
  "greeting": (تحية مخصصة باسم المسؤول),
  "introduction": (فقرة تعريفية — لماذا نحن متحمسون لهذه الشراكة),
  "value_proposition": (ماذا يقدم بودكاست خط للشريك — 3-4 جمل),
  "proposed_packages": [
    {
      "name": (اسم الباقة),
      "description": (وصف قصير),
      "price_range": (نطاق السعر المقترح),
      "deliverables": [(قائمة المخرجات)]
    }
  ],
  "next_steps": (الخطوات التالية — جملتين),
  "closing": (خاتمة مهنية),
  "full_draft": (النص الكامل للعرض مجمّعاً كرسالة واحدة متكاملة)
}

قدم 2-3 باقات متدرجة. اجعل الأسعار منطقية بناءً على ميزانية الشريك.
اكتب بالعربية الفصحى. كن مقنعاً دون مبالغة.`
}

export function buildSponsorshipProposalPrompt(
  input: SponsorshipProposalPromptInput,
): BuiltSponsorshipPrompt {
  const { lead, analysis, tone } = input
  const toneLabel = tone === "formal" ? "رسمي ومهني" : "ودّي ودافئ مع احترافية"
  const analysisBlock = analysis
    ? `
تحليل الذكاء الاصطناعي:
- درجة التوافق: ${analysis.fit_score}/100 (${analysis.quality})
- ملخص النية: ${analysis.intent_summary}
- تقييم الميزانية: ${analysis.budget_fit}
- الباقة المقترحة: ${analysis.recommended_package}
- نقاط القوة: ${(analysis.opportunity_highlights || []).join("، ")}
`
    : ""

  const user = `بيانات الشريك المحتمل:
- الشركة: ${lead.company_name}
- المجال: ${lead.industry}
- المسؤول: ${lead.contact_name} (${lead.job_title})
- أنواع التعاون: ${lead.collaboration_types.join("، ")}
- الهدف: ${lead.main_goal}
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
