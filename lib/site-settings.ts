import { createConfigStore } from "@/lib/config-store"
import { createClient } from "@/lib/supabase/server"
import type { SiteSettingsConfig, FeatureFlags } from "@/types/site-settings"

const USE_SUPABASE = !!(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !process.env.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder")
)

const defaultSiteSettings: SiteSettingsConfig = {
  metadata: {
    name: "خط",
    description: "بودكاست خط - مساحة حوارية تقدّم محادثات عميقة وهادئة",
    tagline: "كل إنسان يحمل قصة تستحق أن تُروى",
    contactEmail: "hello@khatpodcast.com",
  },
  socialLinks: [],
  seo: {
    titleTemplate: "%s | بودكاست خط",
    defaultDescription: "بودكاست خط - مساحة حوارية تقدّم محادثات عميقة وهادئة مع ضيوف يشاركون قصصهم وتجاربهم الحقيقية",
    defaultOgImage: "/og-image.png",
    keywords: ["بودكاست", "خط", "حوار", "قصص"],
  },
  featureFlags: {
    storeEnabled: false,
    hibrEnabled: true,
    guestApplicationsEnabled: true,
    maintenanceMode: false,
    personalizationEnabled: false,
    adsEnabled: false,
    studioEnabled: true,
  },
}

const store = createConfigStore<SiteSettingsConfig>("site-settings.json", defaultSiteSettings)

export async function getSiteSettings(): Promise<SiteSettingsConfig> {
  if (USE_SUPABASE) {
    try {
      const supabase = await createClient()
      const { data, error } = await supabase
        .from("site_settings")
        .select("metadata, social_links, seo, feature_flags")
        .eq("key", "main")
        .maybeSingle()

      if (!error && data) {
        return {
          metadata: data.metadata as SiteSettingsConfig["metadata"],
          socialLinks: data.social_links as SiteSettingsConfig["socialLinks"],
          seo: data.seo as SiteSettingsConfig["seo"],
          featureFlags: data.feature_flags as SiteSettingsConfig["featureFlags"],
        }
      }
      if (error) console.error("getSiteSettings DB error:", error.message)
    } catch (e) {
      console.error("getSiteSettings DB exception:", e)
    }
  }
  return store.read()
}

export async function saveSiteSettings(settings: SiteSettingsConfig): Promise<void> {
  if (USE_SUPABASE) {
    try {
      const supabase = await createClient()
      const { error } = await supabase.from("site_settings").upsert({
        key: "main",
        metadata: settings.metadata,
        social_links: settings.socialLinks,
        seo: settings.seo,
        feature_flags: settings.featureFlags,
      })
      if (!error) return
      console.error("saveSiteSettings DB error:", error.message)
    } catch (e) {
      console.error("saveSiteSettings DB exception:", e)
    }
  }
  await store.write(settings)
}

export async function getFeatureFlags(): Promise<FeatureFlags> {
  const settings = await getSiteSettings()
  return settings.featureFlags
}
