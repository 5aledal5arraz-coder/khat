export interface TeaserConfig {
  id: string
  /** Linked upcoming-episode record (EIR). Null when unlinked/orphaned. */
  eirId: string | null
  /** Linked guest. Null before the EIR reaches guest_assigned. */
  guestId: string | null
  /**
   * Legacy free-text guest name. Nullable since v1: the canonical guest comes
   * from `guestId`/the linked EIR, and an EIR before guest_assigned has none.
   * Public readers MUST hide the guest line when this is null (Sara note 8).
   */
  guestName: string | null
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
  user_agent: string | null
  created_at: string
}

export interface TeaserQuestionStats {
  total: number
  pending: number
  approved: number
  rejected: number
}
