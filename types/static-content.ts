export interface TeamMember {
  id: string
  name: string
  role: string
  image: string
  description: string
  order: number
}

export interface ValueItem {
  id: string
  icon: string
  title: string
  description: string
  color: string
  order: number
}

export interface AboutPageContent {
  hostName: string
  hostTitle: string
  hostDescription: string
  hostPhoto: string
  hostImageUrl?: string
  welcomeVideoId: string
  welcomeVideoUrl?: string
  welcomeVideoPosterUrl?: string
  missionQuote: string
  ctaTitle: string
  ctaDescription: string
  socialLinks: { name: string; url: string; icon: string }[]
  values: ValueItem[]
  teamMembers: TeamMember[]
}

export interface StaticContentConfig {
  about: AboutPageContent
}
