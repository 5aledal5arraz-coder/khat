/**
 * Public-submission notification emails — queued, so a failure is recorded.
 *
 * These used to be fired from inside the POST handler and dropped on the floor:
 *
 *     Promise.all([...]).catch(e => console.error("... email failed:", e))
 *
 * The visitor saw «تم الإرسال», the row was in the database, and if Resend was
 * down or over its 100/day free cap the notification simply never existed —
 * nothing recorded it, nothing retried it, and Khaled had no way to know a
 * guest application had come in. The submission itself was never at risk; being
 * TOLD about it was.
 *
 * On the queue instead: the `jobs` row is the durable record, the worker retries
 * with exponential backoff, and a run that exhausts its attempts stays visible
 * as a failed row carrying `last_error` — the opposite of a swallowed catch.
 *
 * Retry safety: every message carries an idempotency key derived from the
 * submission reference, so re-running after a partial failure cannot mail the
 * applicant their confirmation twice. Do not remove the keys and rely on
 * "it usually works" — a retry sending duplicate mail to an applicant is worse
 * than the original bug.
 */

import {
  sendGuestApplicationAdmin,
  sendGuestApplicationConfirm,
  sendSponsorApplicationAdmin,
  sendSponsorApplicationConfirm,
} from "@/lib/email/send"
import { adminNotifyRecipients, NO_RECIPIENTS_ERROR } from "@/lib/email/recipients"
import { SUBMISSION_NOTIFY_JOB, type SubmissionNotifyPayload } from "../submission-notify-jobs"
import { registerHandler } from "../registry"

interface SubmissionNotifyResult extends Record<string, unknown> {
  kind: string
  reference: string
  recipients: number
}

registerHandler<SubmissionNotifyPayload, SubmissionNotifyResult>(
  SUBMISSION_NOTIFY_JOB,
  async (payload, ctx) => {
    if (!payload?.kind || !payload.reference) {
      throw new Error(`${SUBMISSION_NOTIFY_JOB}: payload requires kind and reference`)
    }

    // Fail the job rather than mail nobody. An unset ADMIN_NOTIFY_EMAIL is a
    // deployment mistake and this is the only place it becomes visible.
    const admins = adminNotifyRecipients()
    if (admins.length === 0) throw new Error(NO_RECIPIENTS_ERROR)

    const ref = payload.reference

    if (payload.kind === "guest_application") {
      await sendGuestApplicationAdmin(
        admins,
        { name: payload.name, email: payload.email, phone: payload.phone, country: payload.country },
        `guest-admin-${ref}`,
      )
      await sendGuestApplicationConfirm(
        payload.email,
        payload.name,
        ref,
        `guest-confirm-${ref}`,
      )
    } else if (payload.kind === "sponsor_application") {
      await sendSponsorApplicationAdmin(
        admins,
        {
          company: payload.company,
          contact: payload.contact,
          email: payload.email,
          budget: payload.budget,
          reference: ref,
        },
        `sponsor-admin-${ref}`,
      )
      await sendSponsorApplicationConfirm(
        payload.email,
        payload.contact,
        ref,
        `sponsor-confirm-${ref}`,
      )
    } else {
      throw new Error(
        `${SUBMISSION_NOTIFY_JOB}: unknown kind "${(payload as { kind: string }).kind}"`,
      )
    }

    return {
      kind: payload.kind,
      reference: ref,
      recipients: admins.length,
      worker: ctx.workerId,
    }
  },
)
