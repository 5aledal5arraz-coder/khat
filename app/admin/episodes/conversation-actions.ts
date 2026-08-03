"use server"

import { revalidatePath } from "next/cache"
import { sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { getEpisodeEnrichment, setEpisodeEnrichment } from "@/lib/episodes/enrichments"
import { requireActionRole } from "@/lib/api-utils"
import { saveVersion } from "@/lib/episodes/versions"
import { getTranscriptForSession } from "@/lib/studio"
import { generateEpisodeConversation, type ConversationField } from "@/lib/ai"
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
  if (!db) return { success: false, error: "قاعدة البيانات غير متوفرة" }

  // The transcript lives on the studio session whose package is linked to
  // this episode — that link is what the studio push already establishes.
  const rows = await db.execute(sql`
    SELECT p.session_id, s.video_title
    FROM studio_website_packages p
    JOIN studio_sessions s ON s.id = p.session_id
    WHERE p.linked_episode_id = ${episodeId}
    ORDER BY p.updated_at DESC NULLS LAST
    LIMIT 1`)
  const row = (
    (rows as unknown as { rows?: { session_id?: string; video_title?: string }[] }).rows ??
    (rows as unknown as { session_id?: string; video_title?: string }[])
  )[0]
  const sessionId = row?.session_id

  if (!sessionId) {
    return {
      success: false,
      error: "لا توجد جلسة استوديو مرتبطة بهذه الحلقة — اربط حزمة الموقع أولاً.",
    }
  }

  const transcript = await getTranscriptForSession(sessionId)
  if (!transcript || transcript.status !== "ready" || !transcript.transcript_clean) {
    return { success: false, error: "لا يوجد نص جاهز لهذه الحلقة" }
  }

  const existing = await getEpisodeEnrichment(episodeId)

  const result = await generateEpisodeConversation({
    transcript: transcript.transcript_clean,
    videoTitle: row?.video_title ?? "",
    existing,
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
}

export async function clearConversationField(
  episodeId: string,
  field: keyof ConversationFields
) {
  const gate = await requireActionRole("EDITOR")
  if (!gate.ok) return { success: false, error: gate.error }
  if (!episodeId) return { success: false, error: "معرّف الحلقة مطلوب" }

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
}
