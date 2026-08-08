"use server"

import { revalidatePath } from "next/cache"
import { requireActionRole } from "@/lib/api-utils"
import { ensureTopic, deleteTopic, setEpisodeTopics } from "@/lib/queries/topics"
import { invalidate } from "@/lib/cache"

function revalidateAll() {
  invalidate("homepage")
  revalidatePath("/")
  revalidatePath("/admin/home-content")
  // Topic pages read the same tables — they have been live and empty all along.
  revalidatePath("/topics", "layout")
}

export async function createTopicAction(name: string, description?: string) {
  const gate = await requireActionRole("EDITOR")
  if (!gate.ok) return { success: false, error: gate.error }
  const topic = await ensureTopic(name, description)
  if (!topic) return { success: false, error: "اسم الموضوع غير صالح" }
  revalidateAll()
  return { success: true }
}

export async function deleteTopicAction(id: string) {
  const gate = await requireActionRole("EDITOR")
  if (!gate.ok) return { success: false, error: gate.error }
  // episode_topics cascades — deleting a topic unfiles every episode under it.
  await deleteTopic(id)
  revalidateAll()
  return { success: true }
}

export async function setEpisodeTopicsAction(episodeId: string, topicIds: string[]) {
  const gate = await requireActionRole("EDITOR")
  if (!gate.ok) return { success: false, error: gate.error }
  if (!episodeId) return { success: false, error: "لا توجد حلقة" }
  await setEpisodeTopics(episodeId, topicIds)
  revalidateAll()
  return { success: true }
}
