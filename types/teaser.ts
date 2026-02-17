export interface TeaserConfig {
  id: string
  guestName: string
  title: string
  prompt: string
  videoFilename: string
  posterImage: string | null
  isActive: boolean
  publishAt: string | null
  expireAt: string | null
  createdAt: string
  updatedAt: string
}

export interface TeaserSettings {
  teasers: TeaserConfig[]
}

export interface TeaserQuestion {
  id: string
  teaser_id: string
  display_name: string | null
  question_text: string
  status: 'pending' | 'approved' | 'rejected'
  ip_hash: string | null
  created_at: string
}

export interface TeaserQuestionStats {
  total: number
  pending: number
  approved: number
  rejected: number
}
