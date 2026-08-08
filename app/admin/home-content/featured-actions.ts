"use server"

import { revalidatePath } from "next/cache"
import { requireActionRole } from "@/lib/api-utils"
import { saveHomepageFeatured } from "@/lib/queries/homepage-featured"
import { setHomepageMode, setHomepageSetting } from "@/lib/queries/homepage-settings"
import type { HomepageMode } from "@/lib/queries/homepage-settings"
import {
  HOMEPAGE_FILTER_KEY,
  MANUAL_SLOTS,
  parseHomepageFilter,
  serializeHomepageFilter,
} from "@/lib/homepage/hall"
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

/**
 * The auto-mode filter for «قاعة الحلقات».
 *
 * Round-tripped through parse/serialize rather than written raw: an unknown
 * string would otherwise sit in the settings table looking configured while the
 * homepage silently fell back to «الأحدث».
 */
export async function setFeaturedFilterAction(raw: string) {
  const gate = await requireActionRole("EDITOR")
  if (!gate.ok) return { success: false, error: gate.error }
  await setHomepageSetting(HOMEPAGE_FILTER_KEY, serializeHomepageFilter(parseHomepageFilter(raw)))
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

  // Cap raised from 3 to MANUAL_SLOTS: manual mode now drives the whole grid,
  // not a three-card showcase, and «أنا أختار الحلقات التي تعرض» means the
  // operator should not run out of slots at three.
  const valid = items
    .filter((item) => item.episode_id && item.position >= 1 && item.position <= MANUAL_SLOTS)
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
