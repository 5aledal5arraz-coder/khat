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

export type SubmissionNotifyPayload = GuestSubmissionPayload | SponsorSubmissionPayload
