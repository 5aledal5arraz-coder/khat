import { getResend, FROM_DISPLAY, REPLY_TO } from './resend'
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
  type PartnerReminderItem,
} from './templates'

export async function sendNewsletterWelcome(email: string, unsubscribeUrl: string) {
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
  })
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
    subject,
    html: directEmailHtml(recipientName, subject, body, senderName),
  })
}

export async function sendGuestApplicationAdmin(
  adminEmail: string,
  params: { name: string; email: string; phone: string; country: string }
) {
  return getResend().emails.send({
    from: FROM_DISPLAY,
    to: adminEmail,
    subject: `طلب ضيف جديد — ${params.name}`,
    html: guestApplicationAdminHtml(params),
  })
}

export async function sendGuestApplicationConfirm(
  applicantEmail: string,
  name: string,
  reference?: string
) {
  return getResend().emails.send({
    from: FROM_DISPLAY,
    to: applicantEmail,
    subject: 'وصلتنا قصتك — بودكاست خط',
    html: guestApplicationConfirmHtml(name, reference),
  })
}

export async function sendGuestPrepConfirm(
  applicantEmail: string,
  name: string
) {
  return getResend().emails.send({
    from: FROM_DISPLAY,
    to: applicantEmail,
    subject: 'استلمنا إجاباتك — بودكاست خط',
    html: guestPrepConfirmHtml(name),
  })
}

export async function sendSponsorApplicationAdmin(
  adminEmail: string,
  params: { company: string; contact: string; email: string; budget: string; reference?: string }
) {
  return getResend().emails.send({
    from: FROM_DISPLAY,
    to: adminEmail,
    subject: `طلب شراكة جديد — ${params.company}`,
    html: sponsorApplicationAdminHtml(params),
  })
}

export async function sendPartnerTaskReminder(
  recipientEmail: string,
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
  adminEmail: string,
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
    subject: `نموذج تحضير جديد — ${params.candidateName}`,
    html: prepSubmittedAdminHtml(params),
  })
}

export async function sendSponsorApplicationConfirm(
  applicantEmail: string,
  contactName: string,
  reference?: string
) {
  return getResend().emails.send({
    from: FROM_DISPLAY,
    to: applicantEmail,
    subject: 'تمّ استلام طلب الشراكة — بودكاست خط',
    html: sponsorApplicationConfirmHtml(contactName, reference),
  })
}
