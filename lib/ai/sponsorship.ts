// Phase 2.0 Batch 2 — both AI calls now route through runAiTask.
// Prompt bodies live in `lib/ai/prompts/sponsorship.ts`.
import { safeParseJSON } from "./client"
import { runAiTask } from "@/lib/ai-router"
import {
  buildSponsorshipAnalysisPrompt,
  SPONSORSHIP_ANALYSIS_PROMPT_VERSION,
  buildSponsorshipProposalPrompt,
  SPONSORSHIP_PROPOSAL_PROMPT_VERSION,
} from "@/lib/ai/prompts/sponsorship"
import type { SponsorshipLead, SponsorshipAnalysis } from "@/types/database"

const LEGACY_ACTOR = "system:legacy-callsite"

interface ActorOpts {
  actorId?: string | null
}

// ---------------------------------------------------------------------------
// Phase 1: Analyze a sponsorship lead
// ---------------------------------------------------------------------------

interface AnalysisResult {
  fit_score: number
  quality: string
  risk_level: string
  intent_summary: string
  budget_fit: string
  recommended_package: string
  reasoning: string
  risk_flags: string[]
  opportunity_highlights: string[]
}

export async function analyzeSponsorshipLead(
  lead: SponsorshipLead,
  opts?: ActorOpts,
): Promise<{ success: true; data: AnalysisResult; raw: Record<string, unknown>; runId?: string } | { success: false; error: string; runId?: string }> {
  try {
    const built = buildSponsorshipAnalysisPrompt({ lead })

    const result = await runAiTask<Record<string, unknown>>({
      taskKind: "structural",
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

    const content = result.rawText || ""
    const parseResult = safeParseJSON<Record<string, unknown>>(content)
    if (!parseResult.success) {
      return { success: false, error: parseResult.error, runId: result.runId }
    }

    const parsed = parseResult.data
    if (typeof parsed.fit_score !== "number") {
      return { success: false, error: "استجابة غير صالحة من النموذج", runId: result.runId }
    }

    return {
      success: true,
      runId: result.runId,
      data: {
        fit_score: Math.max(0, Math.min(100, Math.round(parsed.fit_score))),
        quality: ["high", "medium", "low"].includes(parsed.quality as string) ? (parsed.quality as string) : "medium",
        risk_level: ["low", "medium", "high"].includes(parsed.risk_level as string) ? (parsed.risk_level as string) : "medium",
        intent_summary: (parsed.intent_summary as string) || "",
        budget_fit: ["good", "weak", "unclear"].includes(parsed.budget_fit as string) ? (parsed.budget_fit as string) : "unclear",
        recommended_package: (parsed.recommended_package as string) || "",
        reasoning: (parsed.reasoning as string) || "",
        risk_flags: Array.isArray(parsed.risk_flags) ? parsed.risk_flags : [],
        opportunity_highlights: Array.isArray(parsed.opportunity_highlights) ? parsed.opportunity_highlights : [],
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
}

export async function generateSponsorshipProposal(
  lead: SponsorshipLead,
  analysis: Pick<SponsorshipAnalysis, "fit_score" | "quality" | "intent_summary" | "budget_fit" | "recommended_package" | "opportunity_highlights"> | null,
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
