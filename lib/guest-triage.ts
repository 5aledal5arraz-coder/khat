/**
 * Guest application auto-triage — runs the full AI casting read (live research
 * + editorial analysis) and persists it.
 *
 * Used in two places:
 *   1. The admin "analyze" route (operator-triggered).
 *   2. Automatically on submission (fire-and-forget) so an application arrives
 *      PRE-EVALUATED — the operator opens an already-triaged story.
 *
 * Both go through one function so the persisted shape never drifts. Mirrors
 * lib/partnership-triage.ts.
 */

import { analyzeGuestApplication } from "@/lib/ai/guest-application"
import {
  getGuestApplicationById,
  getGuestAnalysis,
  upsertGuestAnalysis,
  updateGuestApplicationStatus,
} from "@/lib/admin/queries"
import { logActivity, createTask, hasOpenTaskOfType } from "@/lib/crm"
import type { GuestAnalysisRecommendation } from "@/types/database"

export async function runAndPersistGuestAnalysis(
  applicationId: string,
  opts?: { actorId?: string },
): Promise<{ ok: boolean; error?: string }> {
  const app = await getGuestApplicationById(applicationId)
  if (!app) return { ok: false, error: "application not found" }

  await upsertGuestAnalysis(applicationId, { status: "generating" })
  const result = await analyzeGuestApplication(app, { actorId: opts?.actorId ?? "system:auto-triage" })

  if (!result.success) {
    await upsertGuestAnalysis(applicationId, { status: "error", error_message: result.error })
    return { ok: false, error: result.error }
  }

  await upsertGuestAnalysis(applicationId, {
    status: "ready",
    fit_score: result.data.fit_score,
    emotional_depth_score: result.data.emotional_depth_score,
    story_clarity_score: result.data.story_clarity_score,
    originality_score: result.data.originality_score,
    readiness_score: result.data.readiness_score,
    risk_level: result.data.risk_level,
    recommendation: result.data.recommendation as GuestAnalysisRecommendation,
    fit_summary: result.data.fit_summary,
    strongest_angle: result.data.strongest_angle,
    why_now: result.data.why_now,
    audience_value: result.data.audience_value,
    concerns: result.data.concerns,
    strengths: result.data.strengths,
    suggested_direction: result.data.suggested_direction,
    research_summary: result.data.research_summary,
    research_sources: result.research_sources,
    public_presence: result.data.public_presence,
    credibility_note: result.data.credibility_note,
    researched_at: new Date().toISOString(),
    raw_response: result.raw,
    error_message: null,
  })

  await logActivity("guest", applicationId, {
    type: "evaluation_completed",
    summary: `اكتمل تقييم الترشيح — توافق ${result.data.fit_score}/100، التوصية: ${recLabel(result.data.recommendation)}`,
    actor: "ai:casting",
    metadata: {
      fit_score: result.data.fit_score,
      recommendation: result.data.recommendation,
      research_source_count: result.research_sources.length,
    },
  })

  await maybeCreateActionTask(applicationId, result.data.recommendation as GuestAnalysisRecommendation, result.data.fit_summary)

  if (app.status === "new") {
    await updateGuestApplicationStatus(applicationId, "under_review").catch(() => {})
  }
  return { ok: true }
}

/**
 * Fire-and-forget triage on submission. Skips if a finished analysis already
 * exists, and never throws — a failed triage must not affect the applicant's
 * submission.
 */
export async function autoTriageGuestApplication(applicationId: string): Promise<void> {
  try {
    const existing = await getGuestAnalysis(applicationId)
    if (existing && existing.status === "ready") return
    await runAndPersistGuestAnalysis(applicationId, { actorId: "system:auto-triage" })
  } catch (err) {
    console.error("[guest auto-triage] failed for", applicationId, err)
  }
}

function recLabel(rec: string): string {
  return (
    { strong_accept: "قبول قوي", accept: "قبول", consider_later: "للاحتفاظ", reject: "اعتذار" }[rec] || rec
  )
}

const REC_TASK: Record<
  GuestAnalysisRecommendation,
  { title: string; type: string; dueDays: number; priority: "low" | "normal" | "high" }
> = {
  strong_accept: { title: "ردّ بالقبول وادعُه للتحضير", type: "invite", dueDays: 3, priority: "high" },
  accept: { title: "ردّ بالقبول وادعُه للتحضير", type: "invite", dueDays: 5, priority: "high" },
  consider_later: { title: "أبقِ القصة دافئة — تواصل لاحقًا", type: "follow_up", dueDays: 30, priority: "low" },
  reject: { title: "أرسل اعتذارًا لطيفًا", type: "reply", dueDays: 7, priority: "normal" },
}

async function maybeCreateActionTask(
  applicationId: string,
  rec: GuestAnalysisRecommendation,
  detail: string,
): Promise<void> {
  try {
    const spec = REC_TASK[rec]
    if (!spec) return
    if (await hasOpenTaskOfType("guest", applicationId, spec.type)) return
    const due = new Date(Date.now() + spec.dueDays * 24 * 60 * 60 * 1000).toISOString()
    await createTask("guest", applicationId, {
      title: spec.title,
      detail: detail || undefined,
      type: spec.type,
      priority: spec.priority,
      due_at: due,
      created_by: "ai:casting",
    })
  } catch (err) {
    console.error("[guest] auto action-task failed for", applicationId, err)
  }
}
