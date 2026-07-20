"use server"

import { revalidatePath } from "next/cache"
import { requireActionRole } from "@/lib/api-utils"
import { saveHomepageThinkers } from "@/lib/queries/homepage-thinkers"
import { setHomepageMode } from "@/lib/queries/homepage-settings"
import type { HomepageMode } from "@/lib/queries/homepage-settings"
import { invalidate } from "@/lib/cache"

function revalidateAll() {
  invalidate("homepage")
  revalidatePath("/")
  revalidatePath("/admin/home-content")
}

export async function setThinkersModeAction(mode: HomepageMode) {
  const gate = await requireActionRole("EDITOR")
  if (!gate.ok) return { success: false, error: gate.error }
  await setHomepageMode("thinkers", mode)
  revalidateAll()
  return { success: true }
}

export async function saveThinkersAction(
  items: {
    position: number
    guest_id: string
    custom_title: string
    custom_description: string
    custom_image: string
  }[]
) {
  const gate = await requireActionRole("EDITOR")
  if (!gate.ok) return { success: false, error: gate.error }

  const valid = items
    .filter((item) => item.guest_id && item.position >= 1)
    .map((item) => ({
      position: item.position,
      guest_id: item.guest_id,
      custom_title: item.custom_title || undefined,
      custom_description: item.custom_description || undefined,
      custom_image: item.custom_image || undefined,
    }))

  await saveHomepageThinkers(valid)
  revalidateAll()
  return { success: true }
}
