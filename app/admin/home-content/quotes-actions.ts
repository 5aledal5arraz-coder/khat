"use server"

import { revalidatePath } from "next/cache"
import {
  getAllHomeQuotes,
  addHomeQuote,
  updateHomeQuote,
  deleteHomeQuote,
} from "@/lib/home-quotes"

function revalidateAll() {
  revalidatePath("/")
  revalidatePath("/admin/home-content")
}

export async function createQuoteAction(formData: FormData) {
  const text = formData.get("text") as string
  const attribution = formData.get("attribution") as string
  const theme = (formData.get("theme") as string) || undefined
  const episode_id = (formData.get("episode_id") as string) || undefined
  const episode_slug = (formData.get("episode_slug") as string) || undefined
  const episode_title = (formData.get("episode_title") as string) || undefined
  const scheduled_date = (formData.get("scheduled_date") as string) || undefined

  if (!text || !attribution) {
    return { success: false, error: "النص والمصدر مطلوبان" }
  }

  await addHomeQuote({
    text,
    attribution,
    theme,
    episode_id,
    episode_slug,
    episode_title,
    scheduled_date,
    status: "draft",
  })

  revalidateAll()
  return { success: true }
}

export async function updateQuoteAction(id: string, formData: FormData) {
  const text = formData.get("text") as string
  const attribution = formData.get("attribution") as string
  const theme = (formData.get("theme") as string) || undefined
  const episode_id = (formData.get("episode_id") as string) || undefined
  const episode_slug = (formData.get("episode_slug") as string) || undefined
  const episode_title = (formData.get("episode_title") as string) || undefined
  const scheduled_date = (formData.get("scheduled_date") as string) || undefined

  const updated = await updateHomeQuote(id, {
    text,
    attribution,
    theme,
    episode_id,
    episode_slug,
    episode_title,
    scheduled_date,
  })

  if (!updated) return { success: false, error: "الاقتباس غير موجود" }

  revalidateAll()
  return { success: true }
}

export async function deleteQuoteAction(id: string) {
  const deleted = await deleteHomeQuote(id)
  if (!deleted) return { success: false, error: "الاقتباس غير موجود" }

  revalidateAll()
  return { success: true }
}

export async function publishQuoteAction(id: string) {
  const updated = await updateHomeQuote(id, { status: "published" })
  if (!updated) return { success: false, error: "الاقتباس غير موجود" }

  revalidateAll()
  return { success: true }
}

export async function unpublishQuoteAction(id: string) {
  const updated = await updateHomeQuote(id, { status: "draft" })
  if (!updated) return { success: false, error: "الاقتباس غير موجود" }

  revalidateAll()
  return { success: true }
}

export async function scheduleQuoteAction(id: string, date: string) {
  const updated = await updateHomeQuote(id, { scheduled_date: date })
  if (!updated) return { success: false, error: "الاقتباس غير موجود" }

  revalidateAll()
  return { success: true }
}
