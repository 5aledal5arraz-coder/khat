"use server"

import { revalidatePath } from "next/cache"
import { addTopic, updateTopic, deleteTopic } from "@/lib/topics-config"
import { requireAdmin } from "@/lib/api-utils"

export async function createTopicAction(data: {
  name: string
  slug: string
  description?: string
  color: string
  icon?: string
}) {
  await requireAdmin()
  await addTopic(data)
  revalidatePath("/admin/topics")
  revalidatePath("/episodes")
  return { success: true }
}

export async function updateTopicAction(
  id: string,
  data: {
    name?: string
    slug?: string
    description?: string
    color?: string
    icon?: string
  }
) {
  await requireAdmin()
  const result = await updateTopic(id, data)
  if (!result) throw new Error("Topic not found")
  revalidatePath("/admin/topics")
  revalidatePath("/episodes")
  return { success: true }
}

export async function deleteTopicAction(id: string) {
  await requireAdmin()
  const result = await deleteTopic(id)
  if (!result) throw new Error("Topic not found")
  revalidatePath("/admin/topics")
  revalidatePath("/episodes")
  return { success: true }
}
