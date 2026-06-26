// Phase 2.0 Batch 2 — both AI calls now route through runAiTask.
// Prompt bodies live in `lib/ai/prompts/sponsorship.ts`.
import { safeParseJSON } from "./client"
import { runAiTask } from "@/lib/ai-router"
import {
  buildPartnershipEvaluationPrompt,
  SPONSORSHIP_ANALYSIS_PROMPT_VERSION,
  buildSponsorshipProposalPrompt,
  SPONSORSHIP_PROPOSAL_PROMPT_VERSION,
  type ResearchSnippet,
} from "@/lib/ai/prompts/sponsorship"
import { geminiSearchWeb, isGeminiConfigured } from "@/lib/ai/preparation/research/gemini"
import type {
  SponsorshipLead,
  SponsorshipAnalysis,
  PartnershipFitVerdict,
  ResearchSource,
} from "@/types/database"

const FIT_VERDICTS: PartnershipFitVerdict[] = [
  "strong_fit",
  "possible_fit",
  "weak_fit",
  "not_recommended",
]

// ---------------------------------------------------------------------------
// Live online research — real Google search via Gemini grounding.
// Fail-safe: returns empty sets when Gemini isn't configured or errors, so the
// evaluation still runs from the application alone.
// ---------------------------------------------------------------------------

export async function researchCompany(
  lead: SponsorshipLead,
): Promise<{ snippets: ResearchSnippet[]; sources: ResearchSource[] }> {
  if (!isGeminiConfigured()) return { snippets: [], sources: [] }
  const site = lead.company_website ? ` (موقعها: ${lead.company_website})` : ""
  const query =
    `ابحث عن شركة "${lead.company_name}"${site} العاملة في مجال ${lead.industry}. ` +
    `اجمع معلومات موثّقة عن: ماذا تقدّم من منتجات أو خدمات، حجمها ومكانتها في السوق ومنافسيها، ` +
    `سمعتها والانطباع العام عنها وأي جدل أو مخاوف، جمهورها وعملاؤها، وأي تغطية إعلامية حديثة.`
  try {
    const sources = await geminiSearchWeb(query, 8)
    return {
      snippets: sources.map((s) => ({ title: s.title, url: s.url, snippet: s.snippet })),
      sources: sources.map((s) => ({ title: s.title, url: s.url })),
    }
  } catch {
    return { snippets: [], sources: [] }
  }
}

const LEGACY_ACTOR = "system:legacy-callsite"

interface ActorOpts {
  actorId?: string | null
}

// ---------------------------------------------------------------------------
// Full partnership evaluation: live research + structured company assessment
// + structure / episode-count / pricing recommendations.
// Keeps the export name `analyzeSponsorshipLead` (one caller + an index re-export).
// ---------------------------------------------------------------------------

export interface EvaluationResult {
  fit_score: number
  fit_verdict: PartnershipFitVerdict
  fit_reasoning: string
  quality: string
  risk_level: string
  intent_summary: string
  budget_fit: string
  recommended_package: string
  reasoning: string
  risk_flags: string[]
  opportunity_highlights: string[]
  research_summary: string
  reputation: string
  products_summary: string
  market_position: string
  audience_summary: string
  recommended_structure: string
  recommended_episodes: number | null
  pricing_strategy: string
}

const str = (v: unknown): string => (typeof v === "string" ? v : "")
const strArr = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []

export async function analyzeSponsorshipLead(
  lead: SponsorshipLead,
  opts?: ActorOpts,
): Promise<
  | { success: true; data: EvaluationResult; research_sources: ResearchSource[]; raw: Record<string, unknown>; runId?: string }
  | { success: false; error: string; runId?: string }
> {
  try {
    // 1. Research the company online (real web search; fail-safe).
    const research = await researchCompany(lead)

    // 2. Evaluate: full application + live research → structured assessment.
    const built = buildPartnershipEvaluationPrompt({ lead, research: research.snippets })
    const result = await runAiTask<Record<string, unknown>>({
      taskKind: "editorial",
      eirId: null,
      subjectTable: "sponsorship_leads",
      subjectId: lead.id ?? null,
      actorId: opts?.actorId ?? LEGACY_ACTOR,
      promptVersion: SPONSORSHIP_ANALYSIS_PROMPT_VERSION,
      input: built.input,
      prompt: [
        { role: "system", content: built.system },
        { role: "user", content: built.user },
      ],
      expectJson: true,
      providerOptions: { temperature: 0.3 },
    })

    if (result.status !== "succeeded") {
      return { success: false, error: result.errorMessage || "خطأ غير معروف", runId: result.runId }
    }

    const parseResult = safeParseJSON<Record<string, unknown>>(result.rawText || "")
    if (!parseResult.success) {
      return { success: false, error: parseResult.error, runId: result.runId }
    }

    const parsed = parseResult.data
    if (typeof parsed.fit_score !== "number") {
      return { success: false, error: "استجابة غير صالحة من النموذج", runId: result.runId }
    }

    const episodesNum = Number(parsed.recommended_episodes)

    return {
      success: true,
      runId: result.runId,
      research_sources: research.sources,
      data: {
        fit_score: Math.max(0, Math.min(100, Math.round(parsed.fit_score))),
        fit_verdict: FIT_VERDICTS.includes(parsed.fit_verdict as PartnershipFitVerdict)
          ? (parsed.fit_verdict as PartnershipFitVerdict)
          : "possible_fit",
        fit_reasoning: str(parsed.fit_reasoning),
        quality: ["high", "medium", "low"].includes(parsed.quality as string) ? (parsed.quality as string) : "medium",
        risk_level: ["low", "medium", "high"].includes(parsed.risk_level as string) ? (parsed.risk_level as string) : "medium",
        intent_summary: str(parsed.intent_summary),
        budget_fit: ["good", "weak", "unclear"].includes(parsed.budget_fit as string) ? (parsed.budget_fit as string) : "unclear",
        recommended_package: str(parsed.recommended_package),
        reasoning: str(parsed.reasoning),
        risk_flags: strArr(parsed.risk_flags),
        opportunity_highlights: strArr(parsed.opportunity_highlights),
        research_summary: str(parsed.research_summary),
        reputation: str(parsed.reputation),
        products_summary: str(parsed.products_summary),
        market_position: str(parsed.market_position),
        audience_summary: str(parsed.audience_summary),
        recommended_structure: str(parsed.recommended_structure),
        recommended_episodes: Number.isFinite(episodesNum) && episodesNum > 0 ? Math.round(episodesNum) : null,
        pricing_strategy: str(parsed.pricing_strategy),
      },
      raw: {
        model: result.modelName,
        usage: { prompt_tokens: result.tokensIn, completion_tokens: result.tokensOut },
        run_id: result.runId,
        research_source_count: research.sources.length,
      },
    }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "خطأ غير معروف" }
  }
}

// ---------------------------------------------------------------------------
// Phase 2: Generate a proposal draft
// ---------------------------------------------------------------------------

interface ProposalResult {
  subject: string
  greeting: string
  introduction: string
  value_proposition: string
  proposed_packages: { name: string; description: string; price_range: string; deliverables: string[] }[]
  next_steps: string
  closing: string
  full_draft: string
  /** A short, ready-to-send reply email introducing the proposal. */
  reply_email: string
}

export async function generateSponsorshipProposal(
  lead: SponsorshipLead,
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
  > | null,
  tone: "formal" | "warm" = "formal",
  opts?: ActorOpts,
): Promise<{ success: true; data: ProposalResult; raw: Record<string, unknown>; runId?: string } | { success: false; error: string; runId?: string }> {
  try {
    const built = buildSponsorshipProposalPrompt({ lead, analysis, tone })

    const result = await runAiTask<Record<string, unknown>>({
      taskKind: "editorial",
      eirId: null,
      subjectTable: "sponsorship_leads",
      subjectId: lead.id ?? null,
      actorId: opts?.actorId ?? LEGACY_ACTOR,
      promptVersion: SPONSORSHIP_PROPOSAL_PROMPT_VERSION,
      input: built.input,
      prompt: [
        { role: "system", content: built.system },
        { role: "user", content: built.user },
      ],
      expectJson: true,
      providerOptions: { temperature: 0.5 },
    })

    if (result.status !== "succeeded") {
      return { success: false, error: result.errorMessage || "خطأ غير معروف", runId: result.runId }
    }

    const content = result.rawText || ""
    const parseResult = safeParseJSON<Record<string, unknown>>(content)
    if (!parseResult.success) {
      return { success: false, error: parseResult.error, runId: result.runId }
    }

    const parsed = parseResult.data
    if (!parsed.full_draft) {
      return { success: false, error: "استجابة غير مكتملة من النموذج", runId: result.runId }
    }

    return {
      success: true,
      runId: result.runId,
      data: {
        subject: (parsed.subject as string) || `عرض شراكة — بودكاست خط × ${lead.company_name}`,
        greeting: (parsed.greeting as string) || "",
        introduction: (parsed.introduction as string) || "",
        value_proposition: (parsed.value_proposition as string) || "",
        proposed_packages: Array.isArray(parsed.proposed_packages) ? parsed.proposed_packages : [],
        next_steps: (parsed.next_steps as string) || "",
        closing: (parsed.closing as string) || "",
        full_draft: parsed.full_draft as string,
        reply_email: (parsed.reply_email as string) || "",
      },
      raw: {
        model: result.modelName,
        usage: { prompt_tokens: result.tokensIn, completion_tokens: result.tokensOut },
        run_id: result.runId,
      },
    }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "خطأ غير معروف" }
  }
}
