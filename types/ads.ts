export interface SponsorData {
  name: string
  logo: string
  title: string
  description: string
  url: string
  image: string
}

export interface BannerData {
  image: string
  url: string
  alt: string
}

export interface AdSettings {
  sponsoredCard: {
    enabled: boolean
    data: SponsorData
  }
  bannerAd: {
    enabled: boolean
    data: BannerData
  }
}

export type AdSlotPosition = "home_sponsored" | "episode_banner" | "space_sidebar" | "footer_banner"

export interface AdSchedule {
  startDate: string | null
  endDate: string | null
}

export interface AdSlot {
  id: string
  position: AdSlotPosition
  label: string
  enabled: boolean
  schedule: AdSchedule
  type: "sponsored_card" | "banner"
  sponsoredData?: SponsorData
  bannerData?: BannerData
  updatedAt: string
}

export interface EnhancedAdSettings {
  slots: AdSlot[]
}
