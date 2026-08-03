"use server"

import { revalidatePath } from "next/cache"
import { getEpisodeEnrichment, setEpisodeEnrichment } from "@/lib/episodes/enrichments"
import { requireActionRole } from "@/lib/api-utils"
import { saveVersion } from "@/lib/episodes/versions"
import { enqueueJob, findInFlightJobByPayload, getJob } from "@/lib/jobs"
import {
  EPISODE_CONVERSATION_GENERATE_JOB,
  type EpisodeConversationJobPayload,
} from "@/lib/jobs/episode-conversation-jobs"
import type { ConversationField } from "@/lib/ai"
import type { EpisodeEnrichment } from "@/types/episodes"

type ConversationFields = Pick<
  EpisodeEnrichment,
  | "why_this_conversation"
  | "before_you_watch"
  | "conversation_map"
  | "central_question"
  | "exclusive_clip"
  | "unsaid_reflections"
  | "unsaid_reflections_approved"
>

export async function saveConversationData(episodeId: string, data: ConversationFields) {
  const gate = await requireActionRole("EDITOR")
  if (!gate.ok) return { success: false, error: gate.error }
  if (!episodeId) return { success: false, error: "معرّف الحلقة مطلوب" }

  try {
    // Save version snapshot before change
    const existing = await getEpisodeEnrichment(episodeId)
    if (existing) {
      await saveVersion(episodeId, "conversation", { enrichment: existing }, "تعديل بيانات المحادثة")
    }

    await setEpisodeEnrichment({
      episodeId,
      ...data,
      updatedAt: new Date().toISOString(),
    })

    revalidatePath("/")
    revalidatePath("/episodes")
    // episodeId is a UUID, not a slug — invalidate all episode detail pages
    revalidatePath("/episodes/[slug]", "page")
    revalidatePath("/admin/episodes")
    return { success: true }
  } catch (error) {
    console.error("saveConversationData failed:", error)
    return { success: false, error: "تعذّر حفظ بيانات المحادثة — راجع سجلّ الخادم" }
  }
}

/**
 * ص-٩ — START generating the empty "conversation" sections for one episode.
 *
 * ENQUEUES ONLY. The generation itself takes ~132s, and nginx severs a proxied
 * request at 120s on the droplet, so doing it inline would give the operator a
 * dead button and no reason — so the work runs in the worker
 * (lib/jobs/handlers/episode-conversation.ts) and this returns a jobId the UI
 * polls with `getConversationGenerationStatus`.
 *
 * REQUIRES THE WORKER: `npm run worker` (or `npm run dev:all`) locally, the
 * `khat-worker` PM2 process in production. Without it the job sits `pending`
 * forever — which the UI says out loud rather than spinning silently.
 *
 * DEDUP: a double-click (or refresh-then-click) must not spawn a second run
 * against the same episode; an in-flight job is adopted instead.
 */
export async function startConversationGeneration(
  episodeId: string,
  options?: { only?: ConversationField[] },
) {
  const gate = await requireActionRole("EDITOR")
  if (!gate.ok) return { success: false as const, error: gate.error }
  if (!episodeId) return { success: false as const, error: "معرّف الحلقة مطلوب" }

  try {
    const inFlight = await findInFlightJobByPayload(
      EPISODE_CONVERSATION_GENERATE_JOB,
      "episodeId",
      episodeId,
    )
    if (inFlight) {
      return {
        success: true as const,
        jobId: inFlight.id,
        status: inFlight.status,
        alreadyRunning: true,
      }
    }

    const payload: EpisodeConversationJobPayload = { episodeId }
    if (options?.only?.length) payload.only = options.only
    const job = await enqueueJob(EPISODE_CONVERSATION_GENERATE_JOB, payload)
    return { success: true as const, jobId: job.id, status: job.status, alreadyRunning: false }
  } catch (error) {
    // A server action that throws reaches the operator as nothing at all —
    // the button just stops. Always come back with a readable reason.
    console.error("startConversationGeneration failed:", error)
    return { success: false as const, error: "تعذّر بدء التوليد — راجع سجلّ الخادم" }
  }
}

/**
 * Poll one conversation-generation job.
 *
 * Called WITHOUT a jobId it looks up the latest in-flight run for the episode,
 * so a tab refreshed mid-run resumes its «جارٍ التوليد…» state instead of
 * falling back to idle and inviting a duplicate trigger.
 *
 * The cache invalidation the old inline action did at the end now happens
 * HERE, on the poll that first observes success: `revalidatePath` needs a Next
 * request context, which the worker process does not have.
 *
 * A succeeded poll also returns the FRESH enrichment. The form is a controlled
 * client component seeded once from its props, so `router.refresh()` alone
 * would leave the operator staring at empty boxes under a "تم التوليد" banner
 * until a manual reload — a generated result that never reaches the screen is
 * the same silent failure as no result at all. Handing the new values back on
 * the terminal poll re-seeds the form deterministically, with no dependence on
 * when React happens to deliver the refreshed props.
 */
export async function getConversationGenerationStatus(episodeId: string, jobId?: string) {
  const gate = await requireActionRole("EDITOR")
  if (!gate.ok) return { success: false as const, error: gate.error }

  try {
    const job = jobId
      ? await getJob(jobId)
      : await findInFlightJobByPayload(
          EPISODE_CONVERSATION_GENERATE_JOB,
          "episodeId",
          episodeId,
        )

    let enrichment: EpisodeEnrichment | null = null
    if (job?.status === "succeeded") {
      enrichment = await getEpisodeEnrichment(episodeId)
      revalidatePath("/")
      revalidatePath("/episodes")
      // episodeId is a UUID, not a slug — invalidate all episode detail pages
      revalidatePath("/episodes/[slug]", "page")
      revalidatePath("/admin/episodes")
    }

    return {
      success: true as const,
      jobId: job?.id ?? null,
      jobStatus: job?.status ?? null,
      jobError: job?.error_message ?? null,
      filled: (job?.result?.filled as string[] | undefined) ?? null,
      skipped: (job?.result?.skipped as string[] | undefined) ?? null,
      enrichment,
    }
  } catch (error) {
    console.error("getConversationGenerationStatus failed:", error)
    return { success: false as const, error: "تعذّر قراءة حالة التوليد — راجع سجلّ الخادم" }
  }
}

export async function clearConversationField(
  episodeId: string,
  field: keyof ConversationFields
) {
  const gate = await requireActionRole("EDITOR")
  if (!gate.ok) return { success: false, error: gate.error }
  if (!episodeId) return { success: false, error: "معرّف الحلقة مطلوب" }

  try {
    const existing = await getEpisodeEnrichment(episodeId)
    if (!existing) return { success: true }

    await setEpisodeEnrichment({
      ...existing,
      [field]: undefined,
      updatedAt: new Date().toISOString(),
    })

    revalidatePath("/")
    revalidatePath("/episodes")
    // episodeId is a UUID, not a slug — invalidate all episode detail pages
    revalidatePath("/episodes/[slug]", "page")
    revalidatePath("/admin/episodes")
    return { success: true }
  } catch (error) {
    console.error("clearConversationField failed:", error)
    return { success: false, error: "تعذّر مسح الحقل — راجع سجلّ الخادم" }
  }
}
