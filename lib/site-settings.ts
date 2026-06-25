import { db } from "@/lib/db"
import { siteSettings } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import type {
  SiteSettingsConfig,
  SiteMetadata,
  SEODefaults,
  FeatureFlags,
} from "@/types/site-settings"

/**
 * Canonical single-row key for the `site_settings` table.
 *
 * The seeders (`scripts/seed-configs.ts`, `scripts/seed-from-json.ts`) write the
 * real row under `"main"`. This module previously read/wrote `"default"`, so it
 * silently returned hardcoded defaults while the seeded settings sat orphaned —
 * which is why edits here never affected the live site. Standardized on `"main"`.
 */
const SETTINGS_KEY = "main"

const defaultMetadata: SiteMetadata = {
  name: "خط",
  tagline: "",
  description: "",
  contactEmail: "",
}

const defaultSeo: SEODefaults = {
  titleTemplate: "%s | خط بودكاست",
  defaultDescription: "",
  defaultOgImage: "",
  keywords: [],
}

/**
 * Feature-flag defaults. `guestApplicationsEnabled` defaults OPEN so the public
 * guest funnel stays available unless an admin deliberately closes it — gating
 * it on a false-by-default flag would silently shut the form for everyone.
 */
const defaultFeatureFlags: FeatureFlags = {
  guestApplicationsEnabled: true,
  maintenanceMode: false,
  studioEnabled: true,
}

const defaultSettings: SiteSettingsConfig = {
  metadata: defaultMetadata,
  socialLinks: [],
  seo: defaultSeo,
  featureFlags: defaultFeatureFlags,
}

/** Merge a stored partial onto defaults so missing keys never surface as undefined. */
function mergeFeatureFlags(stored: unknown): FeatureFlags {
  const s = (stored && typeof stored === "object" ? stored : {}) as Record<string, unknown>
  return {
    guestApplicationsEnabled:
      typeof s.guestApplicationsEnabled === "boolean"
        ? s.guestApplicationsEnabled
        : defaultFeatureFlags.guestApplicationsEnabled,
    maintenanceMode:
      typeof s.maintenanceMode === "boolean"
        ? s.maintenanceMode
        : defaultFeatureFlags.maintenanceMode,
    studioEnabled:
      typeof s.studioEnabled === "boolean" ? s.studioEnabled : defaultFeatureFlags.studioEnabled,
  }
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
    .where(eq(siteSettings.key, SETTINGS_KEY))
    .limit(1)

  return mergeFeatureFlags(rows[0]?.feature_flags).maintenanceMode === true
}

export async function getSiteSettings(): Promise<SiteSettingsConfig> {
  if (!db) return defaultSettings

  const rows = await db.select().from(siteSettings).where(eq(siteSettings.key, SETTINGS_KEY)).limit(1)
  if (!rows[0]) return defaultSettings

  const row = rows[0]
  return {
    metadata: {
      ...defaultMetadata,
      ...((row.metadata as Partial<SiteMetadata>) || {}),
    },
    socialLinks:
      (row.social_links as unknown as SiteSettingsConfig["socialLinks"]) || defaultSettings.socialLinks,
    seo: {
      ...defaultSeo,
      ...((row.seo as Partial<SEODefaults>) || {}),
    },
    featureFlags: mergeFeatureFlags(row.feature_flags),
  }
}

export async function saveSiteSettings(config: SiteSettingsConfig): Promise<void> {
  if (!db) throw new Error("Database not available")

  await db.insert(siteSettings).values({
    key: SETTINGS_KEY,
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
