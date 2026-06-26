/** Community contribution triage — one structural AI read per submission. */

import { safeParseJSON } from "./client"
import { runAiTask } from "@/lib/ai-router"
import { buildCommunityTriagePrompt, COMMUNITY_TRIAGE_PROMPT_VERSION } from "@/lib/ai/prompts/community"
import type { CommunityContribution, CommunityRecommendedAction } from "@/types/database"

const ACTIONS: CommunityRecommendedAction[] = ["advance", "request_info", "nurture", "decline"]

export interface CommunityTriageData {
  quality_score: number
  category: string
  ai_summary: string
  highlights: string[]
  concerns: string[]
  spam: boolean
  recommended_action: CommunityRecommendedAction
  action_rationale: string
}

const str = (v: unknown): string => (typeof v === "string" ? v : "")
const strArr = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []

export async function triageCommunityContribution(
  c: CommunityContribution,
  opts?: { actorId?: string | null },
): Promise<
  | { success: true; data: CommunityTriageData; raw: Record<string, unknown>; runId?: string }
  | { success: false; error: string; runId?: string }
> {
  try {
    const built = buildCommunityTriagePrompt(c)
    const result = await runAiTask<Record<string, unknown>>({
      taskKind: "structural",
      eirId: null,
      subjectTable: "community_contributions",
      subjectId: c.id ?? null,
      actorId: opts?.actorId ?? "system:community-triage",
      promptVersion: COMMUNITY_TRIAGE_PROMPT_VERSION,
      input: built.input,
      prompt: [
        { role: "system", content: built.system },
        { role: "user", content: built.user },
      ],
      expectJson: true,
      providerOptions: { temperature: 0.2 },
    })

    if (result.status !== "succeeded") {
      return { success: false, error: result.errorMessage || "خطأ غير معروف", runId: result.runId }
    }

    const parsed = safeParseJSON<Record<string, unknown>>(result.rawText || "")
    if (!parsed.success) return { success: false, error: parsed.error, runId: result.runId }
    const p = parsed.data

    return {
      success: true,
      runId: result.runId,
      data: {
        quality_score:
          typeof p.quality_score === "number" ? Math.max(0, Math.min(100, Math.round(p.quality_score))) : 50,
        category: str(p.category),
        ai_summary: str(p.ai_summary),
        highlights: strArr(p.highlights),
        concerns: strArr(p.concerns),
        spam: p.spam === true,
        recommended_action: ACTIONS.includes(p.recommended_action as CommunityRecommendedAction)
          ? (p.recommended_action as CommunityRecommendedAction)
          : "request_info",
        action_rationale: str(p.action_rationale),
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
