"use server"

/**
 * Guest Discovery v2 — server actions. Thin: auth → create run (engine=v2)
 * → enqueue discovery_v2.run → revalidate. Plus per-candidate save/reject.
 */

import { revalidatePath } from "next/cache"
import { requireActionRole } from "@/lib/api-utils"
import { createDiscoveryRun, getDiscoveryRun } from "@/lib/discovery/runs"
import { getCandidate, setCandidateStatus } from "@/lib/discovery/candidates"
import { upsertCrmCandidateFromDiscovery } from "@/lib/guest-candidates/from-discovery"
import { getEpisodeIntelligenceRecord } from "@/lib/eir"
import { enqueueJob } from "@/lib/jobs"
import type { DiscoverySourceConfig } from "@/lib/db/schema/discovery"
import type { V2Geography } from "@/lib/discovery-v2/types"
import { canRetryDegradedRun, webSearchWarning, type WebSearchHealthStats } from "@/lib/discovery-v2/web-search-health"

export interface StartV2Input {
  topic: string
  gender?: "male" | "female" | null
  nationality?: "kuwaiti" | "non_kuwaiti" | null
  /** Where guests come from. Absent/empty → Kuwait only (the default). */
  geography?: V2Geography[] | null
  taste?: "famous" | "balanced" | "hidden_gems"
  limit?: number
  seasonId?: string | null
  episodeCandidateId?: string | null
  /**
   * The EIR this run is FOR (the EIR «تشغيل اكتشاف لهذه الحلقة» CTA). Stored
   * in source_config so the EIR page can list this run's results inline —
   * a standalone EIR has no episode-candidate id to find them by.
   */
  eirId?: string | null
}

export interface StartV2Result {
  success: boolean
  runId?: string
  error?: string
}

export async function startV2DiscoveryAction(
  input: StartV2Input,
): Promise<StartV2Result> {
  const gate = await requireActionRole("EDITOR")
  if (!gate.ok) return { success: false, error: gate.error }
  const user = gate.user
  const topic = (input.topic ?? "").trim()
  if (!topic) return { success: false, error: "الموضوع مطلوب" }
  // The run is shown on (and nominates into) this EIR — it must exist.
  if (input.eirId && !(await getEpisodeIntelligenceRecord(input.eirId))) {
    return { success: false, error: "الحلقة غير موجودة" }
  }

  const source_config = {
    engine: "v2",
    topic,
    filters: {
      gender: input.gender ?? null,
      nationality: input.nationality ?? null,
    },
    // Only known keys survive; empty means "use the default" downstream.
    geography: (input.geography ?? []).filter(
      (g): g is V2Geography => g === "kuwait" || g === "saudi" || g === "gulf",
    ),
    taste: input.taste ?? "balanced",
    limit: Math.max(3, Math.min(input.limit ?? 12, 24)),
    episodeCandidateId: input.episodeCandidateId ?? null,
    eirId: input.eirId ?? null,
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

/**
 * «أعد المحاولة» on a failed run: a NEW run with the failed run's exact
 * inputs (topic, filters, geography, taste, limit, season, episode). The
 * failed run stays as it is — its history is the record of what went wrong.
 */
export async function retryV2DiscoveryAction(runId: string): Promise<StartV2Result> {
  const gate = await requireActionRole("EDITOR")
  if (!gate.ok) return { success: false, error: gate.error }
  const run = await getDiscoveryRun(runId)
  if (!run) return { success: false, error: "التشغيل غير موجود" }
  // A completed run whose web search mostly failed (provider overload) is
  // offered the same retry — its results are incomplete (web-search-health.ts).
  // Not while a spent daily retrieval budget is still spent (same UTC day).
  if (run.status !== "failed") {
    const v2Stats = (run.source_config as { v2_stats?: WebSearchHealthStats } | null)?.v2_stats
    if (run.status !== "completed" || !webSearchWarning(v2Stats)) {
      return { success: false, error: "لا يُعاد إلا تشغيل فاشل أو ناقص" }
    }
    if (!canRetryDegradedRun(v2Stats, run.created_at)) {
      return { success: false, error: "ميزانية البحث اليومية ما زالت منتهية — أعد التشغيل غداً" }
    }
  }
  const cfg = (run.source_config ?? {}) as {
    topic?: string
    filters?: { gender?: StartV2Input["gender"]; nationality?: StartV2Input["nationality"] }
    geography?: V2Geography[] | null
    taste?: StartV2Input["taste"]
    limit?: number
    episodeCandidateId?: string | null
    eirId?: string | null
  }
  return startV2DiscoveryAction({
    topic: String(cfg.topic ?? run.seed_prompt ?? ""),
    gender: cfg.filters?.gender ?? null,
    nationality: cfg.filters?.nationality ?? null,
    geography: cfg.geography ?? null,
    taste: cfg.taste,
    limit: cfg.limit,
    seasonId: run.season_id ?? null,
    episodeCandidateId: cfg.episodeCandidateId ?? run.source_episode_candidate_id ?? null,
    eirId: cfg.eirId ?? null,
  })
}

export async function saveV2CandidateAction(
  id: string,
): Promise<{ success: boolean; error?: string }> {
  const gate = await requireActionRole("EDITOR")
  if (!gate.ok) return { success: false, error: gate.error }
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
  const gate = await requireActionRole("EDITOR")
  if (!gate.ok) return { success: false, error: gate.error }
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
 * A person already in the CRM (same confident QID or folded name) is
 * UPDATED, never duplicated (lib/guest-candidates/from-discovery.ts).
 */
export async function promoteV2CandidateAction(
  id: string,
): Promise<{ success: boolean; candidateId?: string; created?: boolean; error?: string }> {
  const gate = await requireActionRole("EDITOR")
  if (!gate.ok) return { success: false, error: gate.error }
  try {
    const rec = await getCandidate(id)
    if (!rec) return { success: false, error: "المرشّح غير موجود" }
    if (rec.status === "promoted") return { success: false, error: "تمت ترقيته مسبقاً" }
    const r = await upsertCrmCandidateFromDiscovery(rec, { actorId: gate.user.id })
    await setCandidateStatus(id, "promoted")
    revalidatePath("/admin/discovery-v2")
    revalidatePath("/admin/guest-candidates")
    return { success: true, candidateId: r.candidateId, created: r.created }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "خطأ" }
  }
}

/**
 * «رشّحه لهالحلقة» — the discovery result → the CRM candidate, LINKED to
 * this episode (`target_eir_id`). Creates or updates (no duplicates). It
 * does NOT create a guest: when the team later links the candidate to a
 * canonical guest, that guest is assigned to this EIR
 * (app/api/admin/guest-candidates/[id]/link-canonical). Allowed on an
 * already-promoted row — nominating someone already in the CRM just records
 * the episode on their existing record.
 */
export async function nominateV2CandidateForEirAction(
  id: string,
  eirId: string,
): Promise<{
  success: boolean
  candidateId?: string
  created?: boolean
  /** Already nominated for a DIFFERENT episode — nothing was written. */
  conflictEirId?: string
  error?: string
}> {
  const gate = await requireActionRole("EDITOR")
  if (!gate.ok) return { success: false, error: gate.error }
  try {
    const eir = await getEpisodeIntelligenceRecord(eirId)
    if (!eir) return { success: false, error: "الحلقة غير موجودة" }
    const rec = await getCandidate(id)
    if (!rec) return { success: false, error: "المرشّح غير موجود" }
    const r = await upsertCrmCandidateFromDiscovery(rec, { actorId: gate.user.id, eirId })
    if (r.conflict) {
      return {
        success: false,
        candidateId: r.candidateId,
        conflictEirId: r.conflict.otherEirId,
        error: "هالشخص مرشّح لحلقة ثانية",
      }
    }
    if (rec.status !== "promoted") await setCandidateStatus(id, "promoted")
    revalidatePath(`/admin/khat-brain/episodes/${eirId}`)
    revalidatePath("/admin/guest-candidates")
    return { success: true, candidateId: r.candidateId, created: r.created }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "خطأ" }
  }
}
