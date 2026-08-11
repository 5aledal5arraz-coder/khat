/**
 * Job type + payload contract for public-submission notification mail.
 *
 * Separate from `handlers/submission-notify.ts` on purpose: importing a handler
 * module runs its `registerHandler` side effect, and the enqueuing side is a
 * Next request handler that has no business registering worker handlers. Same
 * split as `episode-conversation-jobs.ts`.
 *
 * Naming follows the existing `domain.action` convention.
 */

export const SUBMISSION_NOTIFY_JOB = "email.notify_submission"

/**
 * A person is waiting at the other end of this one — it does not queue behind
 * housekeeping.
 *
 * The claim query is `ORDER BY priority DESC, run_after ASC`, and the market /
 * scheduler jobs sit at 1–4. Enqueued at the default 0, the first real test
 * notification was sorted BELOW a market sweep whose slices run three minutes
 * each: measured on production 2026-08-11, the job sat `pending` while
 * `market.collect` chewed through its backlog. Ten keeps it clear of every
 * background type without inventing a new tier.
 *
 * The worker still runs one job at a time, so a notification can wait out the
 * slice that is already in flight. That bound is the price of the queue; being
 * behind the whole backlog was not.
 *
 * `maxAttempts` is above the default 3 because the thing being retried is a
 * third-party API with a daily cap — worth a couple more tries than an
 * internal job.
 */
export const NOTIFY_ENQUEUE_OPTIONS = { priority: 10, maxAttempts: 5 } as const

export interface GuestSubmissionPayload extends Record<string, unknown> {
  kind: "guest_application"
  reference: string
  name: string
  email: string
  phone: string
  country: string
}

export interface SponsorSubmissionPayload extends Record<string, unknown> {
  kind: "sponsor_application"
  reference: string
  company: string
  contact: string
  email: string
  budget: string
}

export interface CommunityContributionPayload extends Record<string, unknown> {
  kind: "community_contribution"
  reference: string
  email: string
  name: string
  typeLabel: string
}

export interface GuestPrepConfirmPayload extends Record<string, unknown> {
  kind: "guest_prep_confirm"
  reference: string
  email: string
  name: string
}

export interface NewsletterWelcomePayload extends Record<string, unknown> {
  kind: "newsletter_welcome"
  /** The unsubscribe token — unique per subscriber, so it doubles as the idempotency seed. */
  reference: string
  email: string
  unsubscribeUrl: string
}

export type SubmissionNotifyPayload =
  | GuestSubmissionPayload
  | SponsorSubmissionPayload
  | CommunityContributionPayload
  | GuestPrepConfirmPayload
  | NewsletterWelcomePayload
