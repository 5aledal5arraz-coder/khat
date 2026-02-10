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
  customDescription?: string
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
  deletedEpisodes: string[] // episodes removed from the website
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

export interface MediaKitConfig {
  podcastDescription_ar: string
  podcastDescription_en: string
  hostDescription_ar: string
  hostDescription_en: string
  vision_ar: string
  vision_en: string
  values_ar: string
  values_en: string
  audienceDescription_ar: string
  audienceDescription_en: string
  partnershipPhilosophy_ar: string
  partnershipPhilosophy_en: string
  contactEmail: string
  contactPhone: string
  socialLinks: { youtube?: string; instagram?: string; tiktok?: string; x?: string }
}

export const defaultMediaKitConfig: MediaKitConfig = {
  podcastDescription_ar:
    "بودكاست خط هو مساحة حوارية تقدّم محادثات عميقة وهادئة مع ضيوف يشاركون قصصهم وتجاربهم الحقيقية. نؤمن بأن الحوار الصادق يصنع أثرًا، وأن كل شخص يحمل قصة تستحق أن تُروى.",
  podcastDescription_en:
    "Khat Podcast is a conversational space that presents deep, thoughtful dialogues with guests who share their real stories and experiences. We believe that honest conversation creates impact, and that every person carries a story worth telling.",
  hostDescription_ar:
    "يُقدَّم البودكاست بأسلوب حواري هادئ يركّز على الاستماع والعمق، بعيدًا عن المقابلات التقليدية.",
  hostDescription_en:
    "The podcast is presented in a calm, conversational style that focuses on listening and depth, away from traditional interviews.",
  vision_ar:
    "نسعى لبناء منصة إعلامية عربية تُعيد للحوار قيمته، وتُقدّم محتوى يلهم ويثري.",
  vision_en:
    "We aim to build an Arabic media platform that restores the value of dialogue and delivers content that inspires and enriches.",
  values_ar:
    "الأصالة · العمق · الاحترام · الأثر",
  values_en:
    "Authenticity · Depth · Respect · Impact",
  audienceDescription_ar:
    "جمهور خط من الشباب والمهنيين المهتمين بالتطوير الذاتي والقصص الإنسانية والحوارات الهادفة. جمهور واعٍ ومتفاعل يبحث عن محتوى ذي معنى.",
  audienceDescription_en:
    "Khat's audience consists of young professionals interested in personal development, human stories, and meaningful conversations. An engaged, conscious audience seeking content with substance.",
  partnershipPhilosophy_ar:
    "الشراكة مع خط ليست إعلانًا — بل دعم لحوار هادف. نحرص على أن تكون كل شراكة متسقة مع قيمنا وتضيف قيمة حقيقية لجمهورنا.",
  partnershipPhilosophy_en:
    "Partnership with Khat is not advertising — it's supporting meaningful dialogue. We ensure every partnership aligns with our values and adds genuine value to our audience.",
  contactEmail: "hello@khatpodcast.com",
  contactPhone: "",
  socialLinks: {},
}

export interface MediaKitShareConfig {
  enabled: boolean
  slug: string
  passwordHash: string
  createdAt: string
  updatedAt: string
}

export interface YouTubePackSection {
  id: string
  type: "titles" | "description" | "timestamps" | "hashtags" | "clips" | "tweets"
  label: string
  content: string
}

export interface YouTubePackEntry {
  episodeId: string
  episodeTitle: string
  sections: YouTubePackSection[]
  transcript: string | null
  generatedAt: string
}

export type YouTubePackConfig = Record<string, YouTubePackEntry>

export type ThemeMode = "system" | "dark" | "light"
export interface ThemeConfig { mode: ThemeMode }
export const defaultThemeConfig: ThemeConfig = { mode: "system" }

export interface ModerationConfig { aiEnabled: boolean }
export const defaultModerationConfig: ModerationConfig = { aiEnabled: true }

export interface ConfigQuote {
  id: string
  text: string
  theme: string | null
  speaker: string | null  // "guest" | "host" | null
  hidden?: boolean
}

export interface EpisodeQuotesEntry {
  episodeId: string
  episodeTitle: string
  quotes: ConfigQuote[]
  transcript: string | null  // cached for regeneration
  status: "draft" | "published"
  generatedAt: string
  publishedAt: string | null
}

export type EpisodeQuotesConfig = Record<string, EpisodeQuotesEntry>

export interface EpisodeEnrichment {
  episodeId: string
  hero_summary?: string
  full_summary?: string
  takeaways?: string[]
  topics?: string[]
  resources?: { title: string; url: string; type: string | null }[]
  timestamps?: { time_seconds: number; title: string; description: string | null }[]
  updatedAt: string
}

// ---------------------------------------------------------------------------
// Home Page Content Config Types
// ---------------------------------------------------------------------------

export interface HomeQuotesConfig {
  quotes: import('@/types/database').HomeQuote[]
}

export interface EmotionalPathsConfig {
  paths: import('@/types/database').EmotionalPath[]
}

export interface DailyReflectionsConfig {
  reflections: import('@/types/database').DailyReflection[]
}

export const defaultHomeQuotesConfig: HomeQuotesConfig = { quotes: [] }

export const defaultEmotionalPathsConfig: EmotionalPathsConfig = {
  paths: [
    {
      id: 'path-1',
      slug: 'understanding-people',
      title: 'فهم الناس',
      subtitle: 'حلقات عن العلاقات والتواصل والتعاطف',
      icon: 'Users',
      color: '#6366f1',
      episode_ids: [],
      quote_ids: [],
      order: 1,
    },
    {
      id: 'path-2',
      slug: 'motivation-work',
      title: 'الدافع والعمل',
      subtitle: 'حلقات عن الطموح والإنجاز والمهنة',
      icon: 'Rocket',
      color: '#f59e0b',
      episode_ids: [],
      quote_ids: [],
      order: 2,
    },
    {
      id: 'path-3',
      slug: 'faith-meaning',
      title: 'الإيمان والمعنى',
      subtitle: 'حلقات عن الروحانيات والهدف والقيم',
      icon: 'Heart',
      color: '#10b981',
      episode_ids: [],
      quote_ids: [],
      order: 3,
    },
    {
      id: 'path-4',
      slug: 'self-awareness',
      title: 'وعي الذات',
      subtitle: 'حلقات عن النمو الشخصي والتأمل الذاتي',
      icon: 'Eye',
      color: '#8b5cf6',
      episode_ids: [],
      quote_ids: [],
      order: 4,
    },
  ],
}

export const defaultDailyReflectionsConfig: DailyReflectionsConfig = { reflections: [] }

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
