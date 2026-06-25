"use server"

import { revalidatePath } from "next/cache"
import { getSiteSettings, saveSiteSettings } from "@/lib/site-settings"
import { requireAdmin } from "@/lib/api-utils"
import { writeAiRuntimeOverride, type AiRuntimeConfig } from "@/lib/ai-router/runtime-config"
import type { SiteMetadata, SEODefaults, FeatureFlags } from "@/types/site-settings"

export async function updateSiteMetadata(metadata: SiteMetadata) {
  await requireAdmin()
  const settings = await getSiteSettings()
  settings.metadata = metadata
  await saveSiteSettings(settings)
  revalidatePath("/admin/settings")
  // Metadata drives site-wide <title>/description and the contact page.
  revalidatePath("/", "layout")
  revalidatePath("/contact")
}

export async function updateSEODefaults(seo: SEODefaults) {
  await requireAdmin()
  const settings = await getSiteSettings()
  settings.seo = seo
  await saveSiteSettings(settings)
  revalidatePath("/admin/settings")
  revalidatePath("/", "layout")
}

export async function updateFeatureFlags(featureFlags: FeatureFlags) {
  await requireAdmin()
  const settings = await getSiteSettings()
  settings.featureFlags = featureFlags
  await saveSiteSettings(settings)
  revalidatePath("/admin/settings")
  // Flags gate real surfaces: maintenance (layout), guest funnel, studio.
  revalidatePath("/", "layout")
  revalidatePath("/guest")
  revalidatePath("/admin/studio")
}

export async function updateAiRuntimeConfig(cfg: AiRuntimeConfig) {
  await requireAdmin()
  await writeAiRuntimeOverride(cfg)
  // The AI router reads this live; the ops dashboard reflects it.
  revalidatePath("/admin/settings")
  revalidatePath("/admin/ops")
}
