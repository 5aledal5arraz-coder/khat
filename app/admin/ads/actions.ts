"use server"

import { revalidatePath } from "next/cache"
import { getAdSettings, saveAdSettings, saveEnhancedAdSettings } from "@/lib/ads"
import { requireAdmin } from "@/lib/api-utils"
import type { AdSettings, EnhancedAdSettings } from "@/types/ads"

export async function updateAdSettings(settings: AdSettings) {
  await requireAdmin()
  await saveAdSettings(settings)
  revalidatePath("/episodes")
  revalidatePath("/admin/ads")
  return { success: true }
}

export async function updateEnhancedAdSettings(settings: EnhancedAdSettings) {
  await requireAdmin()
  await saveEnhancedAdSettings(settings)
  revalidatePath("/episodes")
  revalidatePath("/admin/ads")
  revalidatePath("/")
  return { success: true }
}

export async function toggleSponsoredCard(enabled: boolean) {
  await requireAdmin()
  const settings = await getAdSettings()
  settings.sponsoredCard.enabled = enabled
  await saveAdSettings(settings)
  revalidatePath("/episodes")
  revalidatePath("/admin/ads")
  return { success: true }
}

export async function toggleBannerAd(enabled: boolean) {
  await requireAdmin()
  const settings = await getAdSettings()
  settings.bannerAd.enabled = enabled
  await saveAdSettings(settings)
  revalidatePath("/episodes")
  revalidatePath("/admin/ads")
  return { success: true }
}
