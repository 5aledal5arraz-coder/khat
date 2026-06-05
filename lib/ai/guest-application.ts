// Phase 2.0 Batch 2 — all three AI calls now route through runAiTask.
// Prompt bodies live in `lib/ai/prompts/guest-application.ts`.
import { safeParseJSON } from "./client"
import { runAiTask } from "@/lib/ai-router"
import {
  buildGuestApplicationAnalysisPrompt,
  GUEST_APPLICATION_ANALYSIS_PROMPT_VERSION,
  buildGuestApplicationConceptPrompt,
  GUEST_APPLICATION_CONCEPT_PROMPT_VERSION,
  buildGuestApplicationResponsesPrompt,
  GUEST_APPLICATION_RESPONSES_PROMPT_VERSION,
} from "@/lib/ai/prompts/guest-application"
import type { GuestApplication, GuestApplicationAnalysis } from "@/types/database"

const LEGACY_ACTOR = "system:legacy-callsite"

interface ActorOpts {
  actorId?: string | null
}

// ---------------------------------------------------------------------------
// Phase 1: Analyze guest application
// ---------------------------------------------------------------------------

interface AnalysisData {
  fit_score: number
  emotional_depth_score: number
  story_clarity_score: number
  originality_score: number
  readiness_score: number
  risk_level: string
  recommendation: string
  fit_summary: string
  strongest_angle: string
  why_now: string
  audience_value: string
  concerns: string[]
  strengths: string[]
  suggested_direction: string
}

export async function analyzeGuestApplication(
  app: GuestApplication,
  opts?: ActorOpts,
): Promise<{ success: true; data: AnalysisData; raw: Record<string, unknown>; runId?: string } | { success: false; error: string; runId?: string }> {
  try {
    const built = buildGuestApplicationAnalysisPrompt({ application: app })

    const result = await runAiTask<Record<string, unknown>>({
      taskKind: "structural",
      eirId: null,
      subjectTable: "guest_applications",
      subjectId: app.id ?? null,
      actorId: opts?.actorId ?? LEGACY_ACTOR,
      promptVersion: GUEST_APPLICATION_ANALYSIS_PROMPT_VERSION,
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

    const p = parseResult.data
    const clamp = (v: unknown) =>
      typeof v === "number" ? Math.max(0, Math.min(100, Math.round(v))) : 50

    const validRecs = ["strong_accept", "accept", "consider_later", "reject"]
    const validRisks = ["low", "medium", "high"]

    return {
      success: true,
      runId: result.runId,
      data: {
        fit_score: clamp(p.fit_score),
        emotional_depth_score: clamp(p.emotional_depth_score),
        story_clarity_score: clamp(p.story_clarity_score),
        originality_score: clamp(p.originality_score),
        readiness_score: clamp(p.readiness_score),
        risk_level: validRisks.includes(p.risk_level as string) ? (p.risk_level as string) : "medium",
        recommendation: validRecs.includes(p.recommendation as string) ? (p.recommendation as string) : "consider_later",
        fit_summary: (p.fit_summary as string) || "",
        strongest_angle: (p.strongest_angle as string) || "",
        why_now: (p.why_now as string) || "",
        audience_value: (p.audience_value as string) || "",
        concerns: Array.isArray(p.concerns) ? p.concerns : [],
        strengths: Array.isArray(p.strengths) ? p.strengths : [],
        suggested_direction: (p.suggested_direction as string) || "",
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
// Phase 2: Generate episode concept
// ---------------------------------------------------------------------------

interface ConceptData {
  proposed_episode_title: string
  title_alternatives: string[]
  episode_hook: string
  episode_logline: string
  why_this_episode_matters: string
  conversation_style: string
  suggested_opening_question: string
  suggested_core_questions: string[]
  suggested_sensitive_areas: string[]
  suggested_topics_to_avoid: string[]
  host_preparation_notes: string
}

export async function generateGuestConcept(
  app: GuestApplication,
  analysis: Pick<GuestApplicationAnalysis, "fit_score" | "recommendation" | "fit_summary" | "strongest_angle" | "audience_value" | "strengths" | "concerns" | "suggested_direction"> | null,
  opts?: ActorOpts,
): Promise<{ success: true; data: ConceptData; raw: Record<string, unknown>; runId?: string } | { success: false; error: string; runId?: string }> {
  try {
    const built = buildGuestApplicationConceptPrompt({ application: app, analysis })

    const result = await runAiTask<Record<string, unknown>>({
      taskKind: "editorial",
      eirId: null,
      subjectTable: "guest_applications",
      subjectId: app.id ?? null,
      actorId: opts?.actorId ?? LEGACY_ACTOR,
      promptVersion: GUEST_APPLICATION_CONCEPT_PROMPT_VERSION,
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

    const p = parseResult.data
    if (!p.proposed_episode_title) {
      return { success: false, error: "استجابة غير مكتملة", runId: result.runId }
    }

    const validStyles = ["story", "dialogue", "hybrid"]

    return {
      success: true,
      runId: result.runId,
      data: {
        proposed_episode_title: p.proposed_episode_title as string,
        title_alternatives: Array.isArray(p.title_alternatives) ? p.title_alternatives : [],
        episode_hook: (p.episode_hook as string) || "",
        episode_logline: (p.episode_logline as string) || "",
        why_this_episode_matters: (p.why_this_episode_matters as string) || "",
        conversation_style: validStyles.includes(p.conversation_style as string) ? (p.conversation_style as string) : "hybrid",
        suggested_opening_question: (p.suggested_opening_question as string) || "",
        suggested_core_questions: Array.isArray(p.suggested_core_questions) ? p.suggested_core_questions : [],
        suggested_sensitive_areas: Array.isArray(p.suggested_sensitive_areas) ? p.suggested_sensitive_areas : [],
        suggested_topics_to_avoid: Array.isArray(p.suggested_topics_to_avoid) ? p.suggested_topics_to_avoid : [],
        host_preparation_notes: (p.host_preparation_notes as string) || "",
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
// Phase 3: Generate response drafts (all 6 variants)
// ---------------------------------------------------------------------------

interface ResponseDrafts {
  acceptance_formal: string
  acceptance_warm: string
  rejection_formal: string
  rejection_warm: string
  consider_later_formal: string
  consider_later_warm: string
}

export async function generateGuestResponseDrafts(
  app: GuestApplication,
  analysis: Pick<GuestApplicationAnalysis, "fit_summary" | "strongest_angle" | "recommendation"> | null,
  opts?: ActorOpts,
): Promise<{ success: true; data: ResponseDrafts; raw: Record<string, unknown>; runId?: string } | { success: false; error: string; runId?: string }> {
  try {
    const built = buildGuestApplicationResponsesPrompt({ application: app, analysis })

    const result = await runAiTask<Record<string, unknown>>({
      taskKind: "editorial",
      eirId: null,
      subjectTable: "guest_applications",
      subjectId: app.id ?? null,
      actorId: opts?.actorId ?? LEGACY_ACTOR,
      promptVersion: GUEST_APPLICATION_RESPONSES_PROMPT_VERSION,
      input: built.input,
      prompt: [
        { role: "system", content: built.system },
        { role: "user", content: built.user },
      ],
      expectJson: true,
      providerOptions: { temperature: 0.6 },
    })

    if (result.status !== "succeeded") {
      return { success: false, error: result.errorMessage || "خطأ غير معروف", runId: result.runId }
    }

    const content = result.rawText || ""
    const parseResult = safeParseJSON<Record<string, unknown>>(content)
    if (!parseResult.success) {
      return { success: false, error: parseResult.error, runId: result.runId }
    }

    const p = parseResult.data
    if (!p.acceptance_formal || !p.rejection_formal) {
      return { success: false, error: "استجابة غير مكتملة", runId: result.runId }
    }

    return {
      success: true,
      runId: result.runId,
      data: {
        acceptance_formal: p.acceptance_formal as string,
        acceptance_warm: (p.acceptance_warm as string) || "",
        rejection_formal: p.rejection_formal as string,
        rejection_warm: (p.rejection_warm as string) || "",
        consider_later_formal: (p.consider_later_formal as string) || "",
        consider_later_warm: (p.consider_later_warm as string) || "",
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
