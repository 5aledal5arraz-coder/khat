import { getResend, FROM_EMAIL } from './resend'
import {
  welcomeEmailHtml,
  commentNotificationHtml,
  replyNotificationHtml,
  likeNotificationHtml,
  followNotificationHtml,
} from './templates'

export async function sendWelcomeEmail(email: string, displayName: string) {
  return getResend().emails.send({
    from: FROM_EMAIL,
    to: email,
    subject: 'أهلاً بك في خط بودكاست!',
    html: welcomeEmailHtml(displayName),
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
