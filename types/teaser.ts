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

/**
 * The three moderation states allowed by `chk_teaser_questions_status`
 * (scripts/post-schema.sql). No fourth state exists — «تراجع» moves a question
 * back to `pending`, it does not introduce one.
 */
export type TeaserQuestionStatus = 'pending' | 'approved' | 'rejected'

/**
 * A teaser question as every reader OUTSIDE the insert path may see it.
 *
 * `ip_hash` and `user_agent` are deliberately ABSENT. They are abuse-tracking
 * material written by `POST /api/teaser/[id]/questions` and must never leave
 * the server: an admin page is a serialized RSC payload, so a bare
 * `select()` would ship a visitor's fingerprint into the HTML. Keeping the two
 * columns out of the type makes a leak a compile error rather than a review
 * finding (team decision 2026-07-19).
 */
export interface TeaserQuestion {
  id: string
  teaser_id: string
  display_name: string | null
  question_text: string
  status: TeaserQuestionStatus
  /** ISO string. Nullable because the column is (it only has a DB default). */
  created_at: string | null
}

export interface TeaserQuestionStats {
  total: number
  pending: number
  approved: number
  rejected: number
}
