import { getResend, FROM_EMAIL } from './resend'
import {
  welcomeEmailHtml,
  newsletterWelcomeHtml,
  commentNotificationHtml,
  replyNotificationHtml,
  likeNotificationHtml,
  followNotificationHtml,
  directEmailHtml,
} from './templates'

export async function sendWelcomeEmail(email: string, displayName: string) {
  return getResend().emails.send({
    from: FROM_EMAIL,
    to: email,
    subject: 'أهلاً بك في خط بودكاست!',
    html: welcomeEmailHtml(displayName),
  })
}

export async function sendNewsletterWelcome(email: string, unsubscribeUrl: string) {
  return getResend().emails.send({
    from: FROM_EMAIL,
    to: email,
    subject: 'أهلاً بك في نشرة خط بودكاست!',
    html: newsletterWelcomeHtml(unsubscribeUrl),
  })
}

export async function sendCommentNotification(
  email: string,
  ownerName: string,
  commenterName: string,
  articleTitle: string,
  preview: string,
  articleUrl: string,
  unsubUrl: string
) {
  return getResend().emails.send({
    from: FROM_EMAIL,
    to: email,
    subject: `💬 ${commenterName} علّق على مقالك`,
    html: commentNotificationHtml(ownerName, commenterName, articleTitle, preview, articleUrl, unsubUrl),
  })
}

export async function sendReplyNotification(
  email: string,
  ownerName: string,
  replierName: string,
  preview: string,
  thoughtUrl: string,
  unsubUrl: string
) {
  return getResend().emails.send({
    from: FROM_EMAIL,
    to: email,
    subject: `↩️ ${replierName} ردّ على خاطرتك`,
    html: replyNotificationHtml(ownerName, replierName, preview, thoughtUrl, unsubUrl),
  })
}

export async function sendLikeNotification(
  email: string,
  ownerName: string,
  likerName: string,
  targetType: string,
  targetUrl: string,
  unsubUrl: string
) {
  return getResend().emails.send({
    from: FROM_EMAIL,
    to: email,
    subject: `❤️ ${likerName} أعجب بمحتواك`,
    html: likeNotificationHtml(ownerName, likerName, targetType, targetUrl, unsubUrl),
  })
}

export async function sendFollowNotification(
  email: string,
  userName: string,
  followerName: string,
  followerUrl: string,
  unsubUrl: string
) {
  return getResend().emails.send({
    from: FROM_EMAIL,
    to: email,
    subject: `👤 ${followerName} بدأ بمتابعتك`,
    html: followNotificationHtml(userName, followerName, followerUrl, unsubUrl),
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
    from: FROM_EMAIL,
    to: email,
    subject,
    html: directEmailHtml(recipientName, subject, body, senderName),
  })
}
