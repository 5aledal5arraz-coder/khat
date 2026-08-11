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
import { getResend, FROM_DISPLAY, REPLY_TO } from './resend'

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
  return getResend().emails.send({
    from: FROM_DISPLAY,
    to: email,
    replyTo: REPLY_TO,
    subject: 'أهلاً بك في نشرة بودكاست خط!',
    html: newsletterWelcomeHtml(unsubscribeUrl),
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
  return getResend().emails.send({
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
  return getResend().emails.send({
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
  return getResend().emails.send({
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
  return getResend().emails.send({
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
  return getResend().emails.send({
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
  return getResend().emails.send({
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
  return getResend().emails.send({
    from: FROM_DISPLAY,
    to: adminEmail,
    replyTo: REPLY_TO,
    subject: `طلب شراكة جديد — ${params.company}`,
    html: sponsorApplicationAdminHtml(params),
  }, idem(idempotencyKey))
}

export async function sendPartnerTaskReminder(
  recipientEmail: string | string[],
  items: PartnerReminderItem[]
) {
  const overdue = items.filter((i) => i.overdue).length
  return getResend().emails.send({
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
  return getResend().emails.send({
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
  return getResend().emails.send({
    from: FROM_DISPLAY,
    to: applicantEmail,
    replyTo: REPLY_TO,
    subject: 'تمّ استلام طلب الشراكة — بودكاست خط',
    html: sponsorApplicationConfirmHtml(contactName, reference),
  }, idem(idempotencyKey))
}
