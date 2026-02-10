"use server"

import { revalidatePath } from "next/cache"
import { getAdSettings, saveAdSettings } from "@/lib/ads"
import type { AdSettings } from "@/types/ads"

export async function updateAdSettings(settings: AdSettings) {
  await saveAdSettings(settings)
  revalidatePath("/episodes")
  revalidatePath("/admin/ads")
  return { success: true }
}

export async function toggleSponsoredCard(enabled: boolean) {
  const settings = await getAdSettings()
  settings.sponsoredCard.enabled = enabled
  await saveAdSettings(settings)
  revalidatePath("/episodes")
  revalidatePath("/admin/ads")
  return { success: true }
}

export async function toggleBannerAd(enabled: boolean) {
  const settings = await getAdSettings()
  settings.bannerAd.enabled = enabled
  await saveAdSettings(settings)
  revalidatePath("/episodes")
  revalidatePath("/admin/ads")
  return { success: true }
}
