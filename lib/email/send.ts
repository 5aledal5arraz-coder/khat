/**
 * REPLY_TO IS ON EVERY SEND, and for a while it was on four of eleven.
 *
 * A message without it takes its reply address from the FROM header — which is
 * `noreply@khatpodcast.com`, an address that receives nothing. So a guest who
 * submitted an application, got the confirmation, and hit Reply to ask a
 * question was writing into a void: it never reached Khaled and it never
 * bounced back to them in a way either of them would notice. The seven silent
 * ones included both confirmations (guest and sponsor) and all three of
 * Khaled's own new-submission notifications.
 *
 * `REPLY_TO` itself must be an address that actually receives — see
 * lib/email/resend.ts.
 */
import type { CreateEmailOptions, CreateEmailRequestOptions } from 'resend'
import { getResend, FROM_DISPLAY, REPLY_TO } from './resend'
import { getEmailSocialLinks } from './social'

/**
 * A REFUSAL FROM RESEND IS NOT AN EXCEPTION — it is a resolved promise.
 *
 * `emails.send()` does NOT reject when the API says no. It RESOLVES with
 * `{ data: null, error: {...} }`. So `await getResend().emails.send(...)` reads
 * a rejected message as a success, and every caller in this file used to do
 * exactly that: eleven of twelve sends returned the response object untouched
 * and nobody looked at `error`. A message the provider never accepted came back
 * indistinguishable from one it did — the operator saw «تم الإرسال», the job
 * went green, `sent_at` and `outcome_emailed_at` got stamped for deliveries
 * that do not exist. That is worse than a visible failure, because a visible
 * failure can be retried and this one stops anyone from knowing to retry.
 *
 * Every send goes through here so the check cannot be forgotten by the next
 * one added. `tests/email/send-failures-are-visible.test.ts` scans the source
 * to keep it that way.
 *
 * THROWING IS THE POINT, and the callers are what make it safe: each one
 * already sits inside a handler that turns the throw into something readable —
 * a failed `jobs` row with `last_error`, a `delivery_error` column, an
 * `emails_failed` count, or a 5xx the operator sees. Nothing here is
 * fire-and-forget, so nothing becomes an unhandled rejection. Before adding a
 * caller, give it one of those; do not add a bare `void send…()`.
 */
async function sendOrThrow(
  what: string,
  payload: CreateEmailOptions,
  options?: CreateEmailRequestOptions,
) {
  const result = await getResend().emails.send(payload, options)
  if (result.error) {
    const reason = result.error.message || result.error.name || 'رفض مزوّد البريد الرسالة'
    throw new Error(`[email:${what}] ${reason}`)
  }
  return result
}

/**
 * Retrying a notification must not mail the applicant twice.
 *
 * The public submissions are queued now, and the queue retries with backoff —
 * so a run that sent the confirmation and then failed on the admin copy would,
 * without this, re-send the confirmation on every attempt. Resend deduplicates
 * on the key, so the caller passes one derived from the submission reference
 * and the retry becomes a no-op for whatever already went out.
 */
function idem(key?: string) {
  return key ? { idempotencyKey: key } : undefined
}
import {
  newsletterWelcomeHtml,
  directEmailHtml,
  guestApplicationAdminHtml,
  guestApplicationConfirmHtml,
  sponsorApplicationAdminHtml,
  sponsorApplicationConfirmHtml,
  prepSubmittedAdminHtml,
  partnershipOfferHtml,
  partnerTaskReminderHtml,
  guestPrepConfirmHtml,
  communityContributionConfirmHtml,
  communityOutcomeHtml,
  type PartnerReminderItem,
} from './templates'

export async function sendNewsletterWelcome(
  email: string,
  unsubscribeUrl: string,
  idempotencyKey?: string
) {
  // Live handles, not the hardcoded copy — see lib/email/social.ts for the
  // drift this closes.
  const social = await getEmailSocialLinks()
  return sendOrThrow('newsletter-welcome', {
    from: FROM_DISPLAY,
    to: email,
    replyTo: REPLY_TO,
    subject: 'أهلاً بك في نشرة بودكاست خط!',
    html: newsletterWelcomeHtml(unsubscribeUrl, social),
    // RFC 8058 one-click unsubscribe — required for marketing mail to stay
    // out of spam and to satisfy Gmail/Yahoo bulk-sender rules.
    headers: {
      'List-Unsubscribe': `<${unsubscribeUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  }, idem(idempotencyKey))
}

export async function sendDirectEmail(
  email: string,
  recipientName: string,
  subject: string,
  body: string,
  senderName: string
) {
  return sendOrThrow('direct', {
    from: FROM_DISPLAY,
    to: email,
    replyTo: REPLY_TO,
    subject,
    html: directEmailHtml(recipientName, subject, body, senderName),
  })
}

export async function sendGuestApplicationAdmin(
  adminEmail: string | string[],
  params: { name: string; email: string; phone: string; country: string },
  idempotencyKey?: string
) {
  return sendOrThrow('guest-application-admin', {
    from: FROM_DISPLAY,
    to: adminEmail,
    replyTo: REPLY_TO,
    subject: `طلب ضيف جديد — ${params.name}`,
    html: guestApplicationAdminHtml(params),
  }, idem(idempotencyKey))
}

export async function sendGuestApplicationConfirm(
  applicantEmail: string,
  name: string,
  reference?: string,
  idempotencyKey?: string
) {
  return sendOrThrow('guest-application-confirm', {
    from: FROM_DISPLAY,
    to: applicantEmail,
    replyTo: REPLY_TO,
    subject: 'وصلتنا قصتك — بودكاست خط',
    html: guestApplicationConfirmHtml(name, reference),
  }, idem(idempotencyKey))
}

export async function sendCommunityContributionConfirm(
  contributorEmail: string,
  name: string,
  typeLabel: string,
  reference?: string,
  idempotencyKey?: string
) {
  return sendOrThrow('community-contribution-confirm', {
    from: FROM_DISPLAY,
    to: contributorEmail,
    replyTo: REPLY_TO,
    subject: 'وصلتنا مساهمتك — بودكاست خط',
    html: communityContributionConfirmHtml(name, typeLabel, reference),
  }, idem(idempotencyKey))
}

export async function sendCommunityOutcome(
  contributorEmail: string,
  name: string,
  typeLabel: string,
  outcome: "accepted" | "routed",
  reference?: string,
) {
  return sendOrThrow('community-outcome', {
    from: FROM_DISPLAY,
    to: contributorEmail,
    replyTo: REPLY_TO,
    subject: outcome === "routed" ? "فكرتك دخلت ورشة خط 🎙️" : "مساهمتك أعجبتنا — بودكاست خط",
    html: communityOutcomeHtml(name, typeLabel, outcome, reference),
  })
}

export async function sendGuestPrepConfirm(
  applicantEmail: string,
  name: string,
  idempotencyKey?: string
) {
  return sendOrThrow('guest-prep-confirm', {
    from: FROM_DISPLAY,
    to: applicantEmail,
    replyTo: REPLY_TO,
    subject: 'استلمنا إجاباتك — بودكاست خط',
    html: guestPrepConfirmHtml(name),
  }, idem(idempotencyKey))
}

export async function sendSponsorApplicationAdmin(
  adminEmail: string | string[],
  params: { company: string; contact: string; email: string; budget: string; reference?: string },
  idempotencyKey?: string
) {
  return sendOrThrow('sponsor-application-admin', {
    from: FROM_DISPLAY,
    to: adminEmail,
    replyTo: REPLY_TO,
    subject: `طلب شراكة جديد — ${params.company}`,
    html: sponsorApplicationAdminHtml(params),
  }, idem(idempotencyKey))
}

/**
 * Send the offer link to ONE company contact.
 *
 * This was the FIRST send to check `result.error`, and the reasoning behind it
 * now lives on `sendOrThrow` above and covers all twelve. It is called out here
 * because the offer is the place where the caller writes a fact to the database
 * off the back of the result (`sent_at`), so a false success would be recorded
 * and outlive the session — Khaled would see «أُرسل» and never resend.
 *
 * The password is NOT a parameter — see `partnershipOfferHtml`.
 */
export async function sendPartnershipOffer(
  recipientEmail: string,
  params: { companyName: string; contactName: string; offerUrl: string; passwordProtected: boolean },
) {
  return sendOrThrow('partnership-offer', {
    from: FROM_DISPLAY,
    to: recipientEmail,
    replyTo: REPLY_TO,
    subject: `عرض شراكة — بودكاست خط × ${params.companyName}`,
    html: partnershipOfferHtml(params),
  })
}

export async function sendPartnerTaskReminder(
  recipientEmail: string | string[],
  items: PartnerReminderItem[]
) {
  const overdue = items.filter((i) => i.overdue).length
  return sendOrThrow('partner-task-reminder', {
    from: FROM_DISPLAY,
    to: recipientEmail,
    replyTo: REPLY_TO,
    subject: `تذكير: ${items.length} مهمة شراكة بحاجة لمتابعة${overdue ? ` (${overdue} متأخرة)` : ''}`,
    html: partnerTaskReminderHtml({ items }),
  })
}

export async function sendPrepSubmittedAdmin(
  adminEmail: string | string[],
  params: {
    candidateName: string
    category: string | null
    completionPercent: number
    candidateId: string
  }
) {
  return sendOrThrow('prep-submitted-admin', {
    from: FROM_DISPLAY,
    to: adminEmail,
    replyTo: REPLY_TO,
    subject: `نموذج تحضير جديد — ${params.candidateName}`,
    html: prepSubmittedAdminHtml(params),
  })
}

export async function sendSponsorApplicationConfirm(
  applicantEmail: string,
  contactName: string,
  reference?: string,
  idempotencyKey?: string
) {
  return sendOrThrow('sponsor-application-confirm', {
    from: FROM_DISPLAY,
    to: applicantEmail,
    replyTo: REPLY_TO,
    subject: 'تمّ استلام طلب الشراكة — بودكاست خط',
    html: sponsorApplicationConfirmHtml(contactName, reference),
  }, idem(idempotencyKey))
}
