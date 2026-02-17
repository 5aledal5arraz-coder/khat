"use server"

import { revalidatePath } from "next/cache"
import {
  updatePath,
  assignEpisodeToPath,
  removeEpisodeFromPath,
  assignQuoteToPath,
  removeQuoteFromPath,
} from "@/lib/emotional-paths"
import { requireAdmin } from "@/lib/api-utils"

function revalidateAll() {
  revalidatePath("/")
  revalidatePath("/paths")
  revalidatePath("/admin/home-content")
}

export async function updatePathAction(id: string, formData: FormData) {
  await requireAdmin()
  const title = formData.get("title") as string
  const subtitle = formData.get("subtitle") as string
  const icon = formData.get("icon") as string
  const color = formData.get("color") as string

  const updated = await updatePath(id, { title, subtitle, icon, color })
  if (!updated) return { success: false, error: "المسار غير موجود" }

  revalidateAll()
  return { success: true }
}

export async function assignEpisodeToPathAction(pathId: string, episodeId: string) {
  await requireAdmin()
  const result = await assignEpisodeToPath(pathId, episodeId)
  if (!result) return { success: false, error: "المسار غير موجود" }

  revalidateAll()
  return { success: true }
}

export async function removeEpisodeFromPathAction(pathId: string, episodeId: string) {
  await requireAdmin()
  const result = await removeEpisodeFromPath(pathId, episodeId)
  if (!result) return { success: false, error: "المسار غير موجود" }

  revalidateAll()
  return { success: true }
}

export async function assignQuoteToPathAction(pathId: string, quoteId: string) {
  await requireAdmin()
  const result = await assignQuoteToPath(pathId, quoteId)
  if (!result) return { success: false, error: "المسار غير موجود" }

  revalidateAll()
  return { success: true }
}

export async function removeQuoteFromPathAction(pathId: string, quoteId: string) {
  await requireAdmin()
  const result = await removeQuoteFromPath(pathId, quoteId)
  if (!result) return { success: false, error: "المسار غير موجود" }

  revalidateAll()
  return { success: true }
}
