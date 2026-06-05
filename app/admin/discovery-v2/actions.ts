"use server"

/**
 * Guest Discovery v2 — server actions. Thin: auth → create run (engine=v2)
 * → enqueue discovery_v2.run → revalidate. Plus per-candidate save/reject.
 */

import { revalidatePath } from "next/cache"
import { requireAdmin, getAdminAuthUser } from "@/lib/api-utils"
import { createDiscoveryRun } from "@/lib/discovery/runs"
import { setCandidateStatus } from "@/lib/discovery/candidates"
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
