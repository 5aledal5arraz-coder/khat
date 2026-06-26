/**
 * Partnership auto-triage — runs the full AI evaluation and persists it.
 *
 * Used in two places:
 *   1. The admin "evaluate" route (operator-triggered).
 *   2. Automatically on submission (fire-and-forget) so a lead arrives
 *      PRE-EVALUATED — the operator opens an already-triaged application.
 *
 * Both go through one function so the persisted shape never drifts.
 */

import { analyzeSponsorshipLead } from "@/lib/ai/sponsorship"
import {
  getSponsorshipLeadById,
  getSponsorshipAnalysis,
  upsertSponsorshipAnalysis,
  updateSponsorshipStatus,
} from "@/lib/admin/queries"

/**
 * Run the evaluation for a lead and persist every field. Returns ok/error.
 * Marks the analysis row `generating` first so the UI can show progress.
 */
export async function runAndPersistEvaluation(
  leadId: string,
  opts?: { actorId?: string },
): Promise<{ ok: boolean; error?: string }> {
  const lead = await getSponsorshipLeadById(leadId)
  if (!lead) return { ok: false, error: "lead not found" }

  await upsertSponsorshipAnalysis(leadId, { status: "generating" })
  const result = await analyzeSponsorshipLead(lead, { actorId: opts?.actorId ?? "system:auto-triage" })

  if (!result.success) {
    await upsertSponsorshipAnalysis(leadId, { status: "error", error_message: result.error })
    return { ok: false, error: result.error }
  }

  await upsertSponsorshipAnalysis(leadId, {
    status: "ready",
    fit_score: result.data.fit_score,
    quality: result.data.quality,
    risk_level: result.data.risk_level,
    intent_summary: result.data.intent_summary,
    budget_fit: result.data.budget_fit,
    recommended_package: result.data.recommended_package,
    reasoning: result.data.reasoning,
    risk_flags: result.data.risk_flags,
    opportunity_highlights: result.data.opportunity_highlights,
    research_summary: result.data.research_summary,
    research_sources: result.research_sources,
    reputation: result.data.reputation,
    products_summary: result.data.products_summary,
    market_position: result.data.market_position,
    audience_summary: result.data.audience_summary,
    fit_verdict: result.data.fit_verdict,
    fit_reasoning: result.data.fit_reasoning,
    recommended_structure: result.data.recommended_structure,
    recommended_episodes: result.data.recommended_episodes,
    pricing_strategy: result.data.pricing_strategy,
    recommended_action: result.data.recommended_action,
    action_rationale: result.data.action_rationale,
    researched_at: new Date().toISOString(),
    raw_response: result.raw,
    error_message: null,
  })

  // Auto-advance a brand-new lead into the review stage.
  if (lead.status === "new") {
    await updateSponsorshipStatus(leadId, "reviewing").catch(() => {})
  }
  return { ok: true }
}

/**
 * Fire-and-forget triage on submission. Skips if a finished analysis already
 * exists, and never throws — a failed triage must not affect the applicant's
 * submission. Runs on the long-lived Node server after the HTTP response.
 */
export async function autoTriageLead(leadId: string): Promise<void> {
  try {
    const existing = await getSponsorshipAnalysis(leadId)
    if (existing && existing.status === "ready") return
    await runAndPersistEvaluation(leadId, { actorId: "system:auto-triage" })
  } catch (err) {
    console.error("[partnership auto-triage] failed for", leadId, err)
  }
}
