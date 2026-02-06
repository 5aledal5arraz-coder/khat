export interface SponsorData {
  name: string
  logo: string
  title: string
  description: string
  url: string
  image: string
}

export interface EpisodeOverride {
  id: string
  originalTitle: string
  customTitle: string
}

export interface BannerData {
  image: string
  url: string
  alt: string
}

export interface EpisodeSection {
  id: string
  label: string
  order: number
  color?: string
  hidden?: boolean
}

export interface EpisodeSectionsConfig {
  sections: EpisodeSection[]
  assignments: Record<string, string> // episodeId -> sectionId
  hiddenEpisodes: string[] // individually hidden episode IDs
}

export interface PlatformStats {
  followers: number
  posts: number
  engagement: string
  url: string
}

export interface AnalyticsConfig {
  youtube: PlatformStats
  x: PlatformStats
  tiktok: PlatformStats
  instagram: PlatformStats
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

export const defaultAdSettings: AdSettings = {
  sponsoredCard: {
    enabled: true,
    data: {
      name: "الراعي الرسمي",
      logo: "",
      title: "عنوان الإعلان الترويجي",
      description: "وصف قصير عن المنتج أو الخدمة المُعلن عنها.",
      url: "#",
      image: "",
    },
  },
  bannerAd: {
    enabled: true,
    data: {
      image: "",
      url: "#",
      alt: "إعلان",
    },
  },
}
