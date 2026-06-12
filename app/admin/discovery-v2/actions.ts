"use server"

/**
 * Guest Discovery v2 — server actions. Thin: auth → create run (engine=v2)
 * → enqueue discovery_v2.run → revalidate. Plus per-candidate save/reject.
 */

import { revalidatePath } from "next/cache"
import { requireAdmin, getAdminAuthUser } from "@/lib/api-utils"
import { createDiscoveryRun } from "@/lib/discovery/runs"
import { getCandidate, setCandidateStatus } from "@/lib/discovery/candidates"
import { createCandidate as createGuestCandidate } from "@/lib/guest-candidates/queries"
import { enqueueJob } from "@/lib/jobs"
import type { DiscoverySourceConfig } from "@/lib/db/schema/discovery"

export interface StartV2Input {
  topic: string
  gender?: "male" | "female" | null
  nationality?: "kuwaiti" | "non_kuwaiti" | null
  taste?: "famous" | "balanced" | "hidden_gems"
  limit?: number
  seasonId?: string | null
  episodeCandidateId?: string | null
}

export interface StartV2Result {
  success: boolean
  runId?: string
  error?: string
}

export async function startV2DiscoveryAction(
  input: StartV2Input,
): Promise<StartV2Result> {
  await requireAdmin()
  const user = await getAdminAuthUser()
  if (!user) return { success: false, error: "غير مصرح" }
  const topic = (input.topic ?? "").trim()
  if (!topic) return { success: false, error: "الموضوع مطلوب" }

  const source_config = {
    engine: "v2",
    topic,
    filters: {
      gender: input.gender ?? null,
      nationality: input.nationality ?? null,
    },
    taste: input.taste ?? "balanced",
    limit: Math.max(3, Math.min(input.limit ?? 12, 24)),
    episodeCandidateId: input.episodeCandidateId ?? null,
  } as unknown as DiscoverySourceConfig

  const run = await createDiscoveryRun({
    season_id: input.seasonId ?? null,
    source_episode_candidate_id: input.episodeCandidateId ?? null,
    seed_prompt: topic,
    source_config,
    created_by: user.id,
  })

  await enqueueJob(
    "discovery_v2.run",
    { run_id: run.id },
    { priority: 5, maxAttempts: 1 },
  )

  revalidatePath("/admin/discovery-v2")
  return { success: true, runId: run.id }
}

export async function saveV2CandidateAction(
  id: string,
): Promise<{ success: boolean; error?: string }> {
  await requireAdmin()
  try {
    await setCandidateStatus(id, "saved_for_later")
    return { success: true }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "خطأ" }
  }
}

export async function rejectV2CandidateAction(
  id: string,
): Promise<{ success: boolean; error?: string }> {
  await requireAdmin()
  try {
    await setCandidateStatus(id, "rejected", { rejection_reason: "رفض المشغّل" })
    return { success: true }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "خطأ" }
  }
}

/**
 * Promote a discovered person into the guest-candidates funnel
 * (outreach/CRM). Carries profile, rationale, and social links over, and
 * stamps the discovery row "promoted" so cross-run memory excludes them.
 */
export async function promoteV2CandidateAction(
  id: string,
): Promise<{ success: boolean; candidateId?: string; error?: string }> {
  await requireAdmin()
  const user = await getAdminAuthUser()
  if (!user) return { success: false, error: "غير مصرح" }
  try {
    const rec = await getCandidate(id)
    if (!rec) return { success: false, error: "المرشّح غير موجود" }
    if (rec.status === "promoted") return { success: false, error: "تمت ترقيته مسبقاً" }
    const name = (rec.display_name ?? rec.proposed_name ?? "").trim()
    if (!name) return { success: false, error: "لا اسم للمرشّح" }

    const v2 = (rec.platform_signals as { v2?: Record<string, unknown> } | null)?.v2 ?? {}
    const social = (v2.social ?? {}) as Record<string, string | null>
    const socialLinks: { platform: string; url: string; is_primary?: boolean }[] = []
    if (social.x) socialLinks.push({ platform: "x", url: social.x, is_primary: true })
    if (social.instagram) socialLinks.push({ platform: "instagram", url: social.instagram })
    if (social.linkedin) socialLinks.push({ platform: "linkedin", url: social.linkedin })
    if (social.youtube_channel) socialLinks.push({ platform: "youtube", url: social.youtube_channel })
    for (const ev of rec.evidence_urls.slice(0, 3)) {
      if (ev?.url) socialLinks.push({ platform: "website", url: ev.url })
    }

    const occupations = Array.isArray(v2.occupations) ? (v2.occupations as string[]) : []
    const created = await createGuestCandidate(
      {
        full_name: name,
        category: rec.proposed_role ?? occupations[0] ?? null,
        country: (v2.nationality as string | null) ?? rec.proposed_country ?? null,
        bio: (v2.why as string | null) ?? rec.general_rationale ?? rec.topic_fit_rationale ?? null,
        source_type: "discovery_v2",
        source_note: rec.topic_fit_rationale ?? rec.general_rationale ?? null,
        status: "shortlisted",
        social_links: socialLinks,
      },
      user.id,
    )

    await setCandidateStatus(id, "promoted")
    revalidatePath("/admin/discovery-v2")
    revalidatePath("/admin/guest-candidates")
    return { success: true, candidateId: created.id }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "خطأ" }
  }
}
