export interface SiteMetadata {
  name: string
  tagline: string
  description: string
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
  guestApplicationsEnabled: boolean
  maintenanceMode: boolean
  studioEnabled: boolean
}

export interface SiteSettingsConfig {
  metadata: SiteMetadata
  socialLinks: SocialLinkConfig[]
  seo: SEODefaults
  featureFlags: FeatureFlags
}
