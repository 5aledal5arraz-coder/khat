import { db } from "@/lib/db"
import { siteSettings } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import type { SiteSettingsConfig } from "@/types/site-settings"

const defaultSettings: SiteSettingsConfig = {
  metadata: {
    name: "خط بودكاست",
    tagline: "",
    description: "",
    contactEmail: "",
  },
  socialLinks: [],
  seo: {
    titleTemplate: "%s | خط بودكاست",
    defaultDescription: "",
    defaultOgImage: "",
    keywords: [],
  },
  featureFlags: {
    guestApplicationsEnabled: false,
    maintenanceMode: false,
    studioEnabled: true,
  },
}

/**
 * Lightweight maintenance flag check for middleware. Unlike `getSiteSettings`,
 * this THROWS when `db` is null so the middleware catch block can log the
 * failure instead of silently serving the site with maintenance mode off.
 */
export async function getMaintenanceFlag(): Promise<boolean> {
  if (!db) throw new Error("Database not available — cannot check maintenance flag")

  const rows = await db
    .select({ feature_flags: siteSettings.feature_flags })
    .from(siteSettings)
    .where(eq(siteSettings.key, "default"))
    .limit(1)

  const flags = rows[0]?.feature_flags as Record<string, boolean> | null | undefined
  return flags?.maintenanceMode === true
}

export async function getSiteSettings(): Promise<SiteSettingsConfig> {
  if (!db) return defaultSettings

  const rows = await db.select().from(siteSettings).where(eq(siteSettings.key, "default")).limit(1)
  if (!rows[0]) return defaultSettings

  const row = rows[0]
  return {
    metadata: (row.metadata as unknown as SiteSettingsConfig["metadata"]) || defaultSettings.metadata,
    socialLinks: (row.social_links as unknown as SiteSettingsConfig["socialLinks"]) || defaultSettings.socialLinks,
    seo: (row.seo as unknown as SiteSettingsConfig["seo"]) || defaultSettings.seo,
    featureFlags: (row.feature_flags as unknown as SiteSettingsConfig["featureFlags"]) || defaultSettings.featureFlags,
  }
}

export async function saveSiteSettings(config: SiteSettingsConfig): Promise<void> {
  if (!db) throw new Error("Database not available")

  await db.insert(siteSettings).values({
    key: "default",
    metadata: config.metadata as unknown as Record<string, unknown>,
    social_links: config.socialLinks as unknown as unknown[],
    seo: config.seo as unknown as Record<string, unknown>,
    feature_flags: config.featureFlags as unknown as Record<string, boolean>,
  }).onConflictDoUpdate({
    target: siteSettings.key,
    set: {
      metadata: config.metadata as unknown as Record<string, unknown>,
      social_links: config.socialLinks as unknown as unknown[],
      seo: config.seo as unknown as Record<string, unknown>,
      feature_flags: config.featureFlags as unknown as Record<string, boolean>,
      updated_at: new Date(),
    },
  })
}
