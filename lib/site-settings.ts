import { createConfigStore } from "@/lib/config-store"
import { db, USE_DB } from "@/lib/db"
import { siteSettings } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
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
      const rows = await db!.select().from(siteSettings).where(eq(siteSettings.key, "main")).limit(1)
      if (rows[0]) {
        return {
          metadata: rows[0].metadata as unknown as SiteSettingsConfig["metadata"],
          socialLinks: rows[0].social_links as unknown as SiteSettingsConfig["socialLinks"],
          seo: rows[0].seo as unknown as SiteSettingsConfig["seo"],
          featureFlags: rows[0].feature_flags as unknown as SiteSettingsConfig["featureFlags"],
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
      const values = {
        key: "main" as const,
        metadata: settings.metadata as unknown as Record<string, unknown>,
        social_links: settings.socialLinks as unknown as unknown[],
        seo: settings.seo as unknown as Record<string, unknown>,
        feature_flags: settings.featureFlags as unknown as Record<string, boolean>,
      }
      await db!.insert(siteSettings).values(values).onConflictDoUpdate({
        target: siteSettings.key,
        set: {
          metadata: values.metadata,
          social_links: values.social_links,
          seo: values.seo,
          feature_flags: values.feature_flags,
        },
      })
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
