"use server"

import { revalidatePath } from "next/cache"
import { getEpisodeEnrichment, setEpisodeEnrichment } from "@/lib/episodes/enrichments"
import { requireActionRole } from "@/lib/api-utils"
import { saveVersion } from "@/lib/episodes/versions"
import {
  findSessionLinkedToEpisode,
  getEpisodeIntelligenceForSession,
  getStudioSession,
  getStudioSessionsByVideoId,
  getTranscriptForSession,
} from "@/lib/studio"
import { generateEpisodeConversation, type ConversationField } from "@/lib/ai"
import type { StudioSession } from "@/types/database"
import type { EpisodeEnrichment } from "@/types/episodes"

type ConversationFields = Pick<
  EpisodeEnrichment,
  | "why_this_conversation"
  | "before_you_watch"
  | "conversation_map"
  | "central_question"
  | "exclusive_clip"
  | "unsaid_reflections"
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
 * ص-٨ — generate the empty "conversation" sections for one episode.
 *
 * Fills ONLY what is currently blank; anything Khaled typed is read first
 * and wins on every leaf (see `mergeConversationFields`). Returns without
 * an AI call — and without cost — when nothing is empty.
 *
 * `exclusive_clip` is not part of this: it embeds a separate published
 * clip's YouTube URL, which no model can know.
 */
export async function generateConversationData(
  episodeId: string,
  options?: { only?: ConversationField[] },
) {
  const gate = await requireActionRole("EDITOR")
  if (!gate.ok) return { success: false, error: gate.error }
  if (!episodeId) return { success: false, error: "معرّف الحلقة مطلوب" }

  try {
    // The transcript lives on a studio session. Preferred route: the website
    // package the operator explicitly linked to this episode. Fallback:
    // `episodes.id` IS the YouTube video id, so a session imported from the
    // same video carries the same transcript. Reading a transcript through
    // the video id is safe — unlike WRITING `linked_episode_id`, which stays
    // an explicit operator action (see lib/studio/website-packages.ts, ص-٣).
    const candidates: StudioSession[] = []
    const linkedSessionId = await findSessionLinkedToEpisode(episodeId)
    if (linkedSessionId) {
      const linked = await getStudioSession(linkedSessionId)
      if (linked) candidates.push(linked)
    }
    for (const session of await getStudioSessionsByVideoId(episodeId)) {
      if (!candidates.some((c) => c.id === session.id)) candidates.push(session)
    }

    if (candidates.length === 0) {
      return {
        success: false,
        error: "لا توجد جلسة استوديو لهذه الحلقة — استورد الحلقة في الاستوديو أولاً.",
      }
    }

    // A failed import and a good one can share a video; take the first
    // session that actually has a ready transcript.
    let session: StudioSession | null = null
    let transcriptText = ""
    for (const candidate of candidates) {
      const transcript = await getTranscriptForSession(candidate.id)
      if (transcript?.status === "ready" && transcript.transcript_clean) {
        session = candidate
        transcriptText = transcript.transcript_clean
        break
      }
    }
    if (!session) return { success: false, error: "لا يوجد نص جاهز لهذه الحلقة" }

    const existing = await getEpisodeEnrichment(episodeId)
    // Free quality lift when the Studio already computed it for this
    // session — the generator folds it into the prompt.
    const intelligence = await getEpisodeIntelligenceForSession(session.id)

    const result = await generateEpisodeConversation({
      transcript: transcriptText,
      videoTitle: session.video_title ?? "",
      existing,
      episodeIntelligence: intelligence?.status === "ready" ? intelligence.data : null,
      only: options?.only,
      eirContext: { subjectTable: "episode_enrichments", subjectId: episodeId },
    })

    if (!result.success) return { success: false, error: result.error }
    if (!result.filled || result.filled.length === 0) {
      return { success: true, filled: [], skipped: result.skipped ?? [] }
    }

    if (existing) {
      await saveVersion(episodeId, "conversation", { enrichment: existing }, "توليد أقسام الحوار")
    }

    await setEpisodeEnrichment({
      episodeId,
      ...result.patch,
      updatedAt: new Date().toISOString(),
    })

    revalidatePath("/")
    revalidatePath("/episodes")
    revalidatePath("/episodes/[slug]", "page")
    revalidatePath("/admin/episodes")
    return { success: true, filled: result.filled, skipped: result.skipped ?? [] }
  } catch (error) {
    // A server action that throws reaches the operator as nothing at all —
    // the button just stops. Always come back with a readable reason.
    console.error("generateConversationData failed:", error)
    return { success: false, error: "تعذّر توليد أقسام الحوار — راجع سجلّ الخادم" }
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
