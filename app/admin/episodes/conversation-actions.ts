"use server"

import { revalidatePath } from "next/cache"
import { getEpisodeEnrichment, setEpisodeEnrichment } from "@/lib/episodes/enrichments"
import { requireActionRole } from "@/lib/api-utils"
import { saveVersion } from "@/lib/episodes/versions"
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
