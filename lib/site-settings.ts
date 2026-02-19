import { createConfigStore } from "@/lib/config-store"
import { pool, USE_DB } from "@/lib/db"
import type { SiteSettingsConfig, FeatureFlags } from "@/types/site-settings"

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
  if (USE_DB) {
    try {
      const { rows } = await pool!.query(
        `SELECT metadata, social_links, seo, feature_flags FROM site_settings WHERE key = $1 LIMIT 1`,
        ["main"]
      )
      if (rows[0]) {
        return {
          metadata: rows[0].metadata as SiteSettingsConfig["metadata"],
          socialLinks: rows[0].social_links as SiteSettingsConfig["socialLinks"],
          seo: rows[0].seo as SiteSettingsConfig["seo"],
          featureFlags: rows[0].feature_flags as SiteSettingsConfig["featureFlags"],
        }
      }
    } catch (e) {
      console.error("getSiteSettings DB exception:", e)
    }
  }
  return store.read()
}

export async function saveSiteSettings(settings: SiteSettingsConfig): Promise<void> {
  if (USE_DB) {
    try {
      await pool!.query(
        `INSERT INTO site_settings (key, metadata, social_links, seo, feature_flags)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (key) DO UPDATE SET
           metadata = EXCLUDED.metadata,
           social_links = EXCLUDED.social_links,
           seo = EXCLUDED.seo,
           feature_flags = EXCLUDED.feature_flags`,
        ["main", JSON.stringify(settings.metadata), JSON.stringify(settings.socialLinks), JSON.stringify(settings.seo), JSON.stringify(settings.featureFlags)]
      )
      return
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
