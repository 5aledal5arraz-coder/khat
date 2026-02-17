"use server"

import { revalidatePath } from "next/cache"
import { saveThemeConfig } from "@/lib/theme"
import { saveModerationConfig } from "@/lib/moderation-config"
import { getSiteSettings, saveSiteSettings } from "@/lib/site-settings"
import { requireAdmin } from "@/lib/api-utils"
import type { ThemeMode } from "@/types/theme"
import type { SiteMetadata, SocialLinkConfig, SEODefaults, FeatureFlags } from "@/types/site-settings"

const VALID_MODES: ThemeMode[] = ["system", "dark", "light"]

export async function updateThemeMode(mode: ThemeMode) {
  await requireAdmin()
  if (!VALID_MODES.includes(mode)) {
    throw new Error("Invalid theme mode")
  }

  await saveThemeConfig({ mode })
  revalidatePath("/", "layout")
}

export async function updateAIModeration(enabled: boolean) {
  await requireAdmin()
  await saveModerationConfig({ aiEnabled: enabled })
  revalidatePath("/admin/settings")
}

export async function updateSiteMetadata(metadata: SiteMetadata) {
  await requireAdmin()
  const settings = await getSiteSettings()
  settings.metadata = metadata
  await saveSiteSettings(settings)
  revalidatePath("/admin/settings")
}

export async function updateSocialLinks(socialLinks: SocialLinkConfig[]) {
  await requireAdmin()
  const settings = await getSiteSettings()
  settings.socialLinks = socialLinks
  await saveSiteSettings(settings)
  revalidatePath("/admin/settings")
}

export async function updateSEODefaults(seo: SEODefaults) {
  await requireAdmin()
  const settings = await getSiteSettings()
  settings.seo = seo
  await saveSiteSettings(settings)
  revalidatePath("/admin/settings")
}

export async function updateFeatureFlags(featureFlags: FeatureFlags) {
  await requireAdmin()
  const settings = await getSiteSettings()
  settings.featureFlags = featureFlags
  await saveSiteSettings(settings)
  revalidatePath("/admin/settings")
  revalidatePath("/", "layout")
}
