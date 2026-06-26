/**
 * Community contribution auto-triage — runs the AI read on submission so the
 * operator opens a PRE-SCORED, spam-flagged contribution. Fire-and-forget;
 * never affects the visitor's submission.
 */

import { triageCommunityContribution } from "@/lib/ai/community"
import { getCommunityContributionById, updateCommunityContribution } from "./queries"
import { logActivity, createTask, hasOpenTaskOfType } from "@/lib/crm"
import type { CommunityRecommendedAction } from "@/types/database"

export async function runAndPersistCommunityTriage(
  id: string,
  opts?: { actorId?: string },
): Promise<{ ok: boolean; error?: string }> {
  const c = await getCommunityContributionById(id)
  if (!c) return { ok: false, error: "contribution not found" }

  await updateCommunityContribution(id, { triage_status: "generating" })
  const result = await triageCommunityContribution(c, { actorId: opts?.actorId ?? "system:community-triage" })

  if (!result.success) {
    await updateCommunityContribution(id, { triage_status: "error", error_message: result.error })
    return { ok: false, error: result.error }
  }

  await updateCommunityContribution(id, {
    triage_status: "ready",
    quality_score: result.data.quality_score,
    category: result.data.category,
    ai_summary: result.data.ai_summary,
    highlights: result.data.highlights,
    concerns: result.data.concerns,
    spam: result.data.spam,
    recommended_action: result.data.recommended_action,
    action_rationale: result.data.action_rationale,
    ai_raw: result.raw,
    error_message: null,
    triaged_at: new Date().toISOString(),
  })

  await logActivity("community", id, {
    type: "triage_completed",
    summary: `فُرزت المساهمة — جودة ${result.data.quality_score}/100${result.data.spam ? " · مُعلّمة كعبثية" : ""}`,
    actor: "ai:community",
    metadata: { quality_score: result.data.quality_score, recommended_action: result.data.recommended_action, spam: result.data.spam },
  })

  // A strong, non-spam contribution gets a follow-up task so it isn't missed.
  if (!result.data.spam && (result.data.recommended_action === "advance" || result.data.quality_score >= 70)) {
    await maybeCreateActionTask(id, result.data.recommended_action)
  }

  if (c.status === "new") await updateCommunityContribution(id, { status: "reviewing" })
  return { ok: true }
}

export async function autoTriageCommunityContribution(id: string): Promise<void> {
  try {
    const existing = await getCommunityContributionById(id)
    if (existing && existing.triage_status === "ready") return
    await runAndPersistCommunityTriage(id, { actorId: "system:community-triage" })
  } catch (err) {
    console.error("[community auto-triage] failed for", id, err)
  }
}

const ACTION_TASK: Record<CommunityRecommendedAction, { title: string; type: string } | null> = {
  advance: { title: "راجع المساهمة ووجّهها إلى خط برين", type: "route" },
  request_info: { title: "تواصل مع المساهم لمزيد من التفاصيل", type: "follow_up" },
  nurture: null,
  decline: null,
}

async function maybeCreateActionTask(id: string, action: CommunityRecommendedAction): Promise<void> {
  try {
    const spec = ACTION_TASK[action]
    if (!spec) return
    if (await hasOpenTaskOfType("community", id, spec.type)) return
    await createTask("community", id, {
      title: spec.title,
      type: spec.type,
      priority: "normal",
      due_at: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
      created_by: "ai:community",
    })
  } catch (err) {
    console.error("[community] auto action-task failed for", id, err)
  }
}
