export interface SiteMetadata {
  name: string
  description: string
  tagline: string
  contactEmail: string
}

export interface SocialLinkConfig {
  platform: string
  url: string
  visible: boolean
}

export interface SEODefaults {
  titleTemplate: string
  defaultDescription: string
  defaultOgImage: string
  keywords: string[]
}

export interface FeatureFlags {
  storeEnabled: boolean
  hibrEnabled: boolean
  guestApplicationsEnabled: boolean
  maintenanceMode: boolean
  personalizationEnabled: boolean
  adsEnabled: boolean
  studioEnabled: boolean
}

export interface SiteSettingsConfig {
  metadata: SiteMetadata
  socialLinks: SocialLinkConfig[]
  seo: SEODefaults
  featureFlags: FeatureFlags
}
