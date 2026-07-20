"use server"

import { revalidatePath } from "next/cache"
import { requireActionRole } from "@/lib/api-utils"
import { saveHomepageFeatured } from "@/lib/queries/homepage-featured"
import { setHomepageMode } from "@/lib/queries/homepage-settings"
import type { HomepageMode } from "@/lib/queries/homepage-settings"
import { invalidate } from "@/lib/cache"

function revalidateAll() {
  invalidate("homepage")
  revalidatePath("/")
  revalidatePath("/admin/home-content")
}

export async function setFeaturedModeAction(mode: HomepageMode) {
  const gate = await requireActionRole("EDITOR")
  if (!gate.ok) return { success: false, error: gate.error }
  await setHomepageMode("featured", mode)
  revalidateAll()
  return { success: true }
}

export async function saveFeaturedEpisodesAction(
  items: {
    position: number
    episode_id: string
    custom_quote: string
    custom_description: string
    custom_image: string
  }[]
) {
  const gate = await requireActionRole("EDITOR")
  if (!gate.ok) return { success: false, error: gate.error }

  const valid = items
    .filter((item) => item.episode_id && item.position >= 1 && item.position <= 3)
    .map((item) => ({
      position: item.position,
      episode_id: item.episode_id,
      custom_quote: item.custom_quote || undefined,
      custom_description: item.custom_description || undefined,
      custom_image: item.custom_image || undefined,
    }))

  await saveHomepageFeatured(valid)
  revalidateAll()
  return { success: true }
}
