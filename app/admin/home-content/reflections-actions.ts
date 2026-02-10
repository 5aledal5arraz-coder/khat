"use server"

import { revalidatePath } from "next/cache"
import {
  addReflection,
  updateReflection,
  deleteReflection,
} from "@/lib/daily-reflections"

function revalidateAll() {
  revalidatePath("/")
  revalidatePath("/admin/home-content")
}

export async function createReflectionAction(formData: FormData) {
  const date = formData.get("date") as string
  const short_quote = formData.get("short_quote") as string
  const reflection = formData.get("reflection") as string
  const thinking_question = formData.get("thinking_question") as string
  const attribution = (formData.get("attribution") as string) || undefined
  const episode_id = (formData.get("episode_id") as string) || undefined
  const episode_slug = (formData.get("episode_slug") as string) || undefined
  const episode_title = (formData.get("episode_title") as string) || undefined
  const quote_id = (formData.get("quote_id") as string) || undefined
  const quote_text = (formData.get("quote_text") as string) || undefined
  const path_slug = (formData.get("path_slug") as string) || undefined
  const path_title = (formData.get("path_title") as string) || undefined

  if (!date || !short_quote || !reflection || !thinking_question) {
    return { success: false, error: "جميع الحقول المطلوبة يجب تعبئتها" }
  }

  await addReflection({
    date,
    short_quote,
    reflection,
    thinking_question,
    attribution,
    episode_id,
    episode_slug,
    episode_title,
    quote_id,
    quote_text,
    path_slug: path_slug as import("@/types/database").PathSlug | undefined,
    path_title,
    status: "draft",
  })

  revalidateAll()
  return { success: true }
}

export async function updateReflectionAction(id: string, formData: FormData) {
  const date = formData.get("date") as string
  const short_quote = formData.get("short_quote") as string
  const reflection = formData.get("reflection") as string
  const thinking_question = formData.get("thinking_question") as string
  const attribution = (formData.get("attribution") as string) || undefined
  const episode_id = (formData.get("episode_id") as string) || undefined
  const episode_slug = (formData.get("episode_slug") as string) || undefined
  const episode_title = (formData.get("episode_title") as string) || undefined
  const quote_id = (formData.get("quote_id") as string) || undefined
  const quote_text = (formData.get("quote_text") as string) || undefined
  const path_slug = (formData.get("path_slug") as string) || undefined
  const path_title = (formData.get("path_title") as string) || undefined

  const updated = await updateReflection(id, {
    date,
    short_quote,
    reflection,
    thinking_question,
    attribution,
    episode_id,
    episode_slug,
    episode_title,
    quote_id,
    quote_text,
    path_slug: path_slug as import("@/types/database").PathSlug | undefined,
    path_title,
  })

  if (!updated) return { success: false, error: "التأمل غير موجود" }

  revalidateAll()
  return { success: true }
}

export async function deleteReflectionAction(id: string) {
  const deleted = await deleteReflection(id)
  if (!deleted) return { success: false, error: "التأمل غير موجود" }

  revalidateAll()
  return { success: true }
}

export async function publishReflectionAction(id: string) {
  const updated = await updateReflection(id, { status: "published" })
  if (!updated) return { success: false, error: "التأمل غير موجود" }

  revalidateAll()
  return { success: true }
}

export async function unpublishReflectionAction(id: string) {
  const updated = await updateReflection(id, { status: "draft" })
  if (!updated) return { success: false, error: "التأمل غير موجود" }

  revalidateAll()
  return { success: true }
}
