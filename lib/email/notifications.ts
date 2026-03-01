import { db } from '@/lib/db'
import { emailNotificationsLog, profiles, hibrArticles, hibrThoughts, hibrComments, hibrReplies } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { APP_URL } from './resend'
import {
  sendWelcomeEmail,
  sendCommentNotification,
  sendReplyNotification,
  sendLikeNotification,
  sendFollowNotification,
} from './send'

// Fire-and-forget: push to microtask queue so the API response returns immediately
function fireAndForget(fn: () => Promise<void>) {
  Promise.resolve().then(fn).catch((err) => {
    console.error('[email-notification]', err)
  })
}

// Check dedup log — returns true if this notification was already sent
async function isDuplicate(
  recipientId: string,
  notificationType: string,
  triggerUserId: string,
  targetId: string
): Promise<boolean> {
  if (!db) return true // no DB = skip
  const result = await db.insert(emailNotificationsLog).values({
    recipient_id: recipientId,
    notification_type: notificationType,
    trigger_user_id: triggerUserId,
    target_id: targetId,
  }).onConflictDoNothing()
  return (result.rowCount ?? 0) === 0 // 0 rows inserted = already existed
}

function unsubNotifUrl(token: string, type: string): string {
  return `${APP_URL}/api/unsubscribe/notifications?token=${token}&type=${type}`
}

// --- Public fire-and-forget triggers ---

export function fireWelcomeEmail(uid: string, email: string, displayName: string) {
  if (!db || !process.env.RESEND_API_KEY) return
  fireAndForget(async () => {
    await sendWelcomeEmail(email, displayName)
  })
}

export function fireCommentNotification(articleId: string, commenterId: string, commentPreview: string) {
  if (!db || !process.env.RESEND_API_KEY) return
  fireAndForget(async () => {
    // Look up article owner
    const articles = await db!.select({ user_id: hibrArticles.user_id }).from(hibrArticles)
      .where(eq(hibrArticles.id, articleId)).limit(1)
    if (!articles[0]) return
    const ownerId = articles[0].user_id

    // Don't notify yourself
    if (ownerId === commenterId) return

    // Check owner's preferences
    const owners = await db!.select({
      email: profiles.email,
      display_name: profiles.display_name,
      notify_comments: profiles.notify_comments,
      notification_unsubscribe_token: profiles.notification_unsubscribe_token,
    }).from(profiles).where(eq(profiles.id, ownerId)).limit(1)
    if (!owners[0] || !owners[0].email || !owners[0].notify_comments) return

    // Dedup
    if (await isDuplicate(ownerId, 'comment', commenterId, articleId)) return

    // Look up commenter name
    const commenters = await db!.select({ display_name: profiles.display_name }).from(profiles)
      .where(eq(profiles.id, commenterId)).limit(1)
    const commenterName = commenters[0]?.display_name || 'مستخدم'

    // Look up article title
    const articleRows = await db!.select({ title: hibrArticles.title }).from(hibrArticles)
      .where(eq(hibrArticles.id, articleId)).limit(1)
    const articleTitle = articleRows[0]?.title || 'مقال'

    const articleUrl = `${APP_URL}/space/articles/${articleId}`
    const unsubUrl = unsubNotifUrl(owners[0].notification_unsubscribe_token!, 'comments')

    await sendCommentNotification(
      owners[0].email,
      owners[0].display_name!,
      commenterName,
      articleTitle,
      commentPreview.slice(0, 200),
      articleUrl,
      unsubUrl
    )
  })
}

export function fireReplyNotification(thoughtId: string, replierId: string, replyPreview: string) {
  if (!db || !process.env.RESEND_API_KEY) return
  fireAndForget(async () => {
    // Look up thought owner
    const thoughts = await db!.select({ user_id: hibrThoughts.user_id }).from(hibrThoughts)
      .where(eq(hibrThoughts.id, thoughtId)).limit(1)
    if (!thoughts[0]) return
    const ownerId = thoughts[0].user_id

    if (ownerId === replierId) return

    const owners = await db!.select({
      email: profiles.email,
      display_name: profiles.display_name,
      notify_replies: profiles.notify_replies,
      notification_unsubscribe_token: profiles.notification_unsubscribe_token,
    }).from(profiles).where(eq(profiles.id, ownerId)).limit(1)
    if (!owners[0] || !owners[0].email || !owners[0].notify_replies) return

    if (await isDuplicate(ownerId, 'reply', replierId, thoughtId)) return

    const repliers = await db!.select({ display_name: profiles.display_name }).from(profiles)
      .where(eq(profiles.id, replierId)).limit(1)
    const replierName = repliers[0]?.display_name || 'مستخدم'

    const thoughtUrl = `${APP_URL}/space/thoughts/${thoughtId}`
    const unsubUrl = unsubNotifUrl(owners[0].notification_unsubscribe_token!, 'replies')

    await sendReplyNotification(
      owners[0].email,
      owners[0].display_name!,
      replierName,
      replyPreview.slice(0, 200),
      thoughtUrl,
      unsubUrl
    )
  })
}

export function fireLikeNotification(targetType: string, targetId: string, likerId: string) {
  if (!db || !process.env.RESEND_API_KEY) return
  fireAndForget(async () => {
    // Look up owner using typed Drizzle tables (no raw SQL)
    const tableMap = {
      article: hibrArticles,
      thought: hibrThoughts,
      comment: hibrComments,
      reply: hibrReplies,
    } as const
    const table = tableMap[targetType as keyof typeof tableMap]
    if (!table) return

    const targets = await db!.select({ user_id: table.user_id }).from(table)
      .where(eq(table.id, targetId)).limit(1)
    if (!targets[0]) return
    const ownerId = targets[0].user_id

    if (ownerId === likerId) return

    const owners = await db!.select({
      email: profiles.email,
      display_name: profiles.display_name,
      notify_likes: profiles.notify_likes,
      notification_unsubscribe_token: profiles.notification_unsubscribe_token,
    }).from(profiles).where(eq(profiles.id, ownerId)).limit(1)
    if (!owners[0] || !owners[0].email || !owners[0].notify_likes) return

    if (await isDuplicate(ownerId, 'like', likerId, targetId)) return

    const likers = await db!.select({ display_name: profiles.display_name }).from(profiles)
      .where(eq(profiles.id, likerId)).limit(1)
    const likerName = likers[0]?.display_name || 'مستخدم'

    // Build URL based on target type
    const urlMap: Record<string, string> = {
      article: `${APP_URL}/space/articles/${targetId}`,
      thought: `${APP_URL}/space/thoughts/${targetId}`,
      comment: `${APP_URL}/space`,
      reply: `${APP_URL}/space`,
    }
    const targetUrl = urlMap[targetType] || `${APP_URL}/space`
    const unsubUrl = unsubNotifUrl(owners[0].notification_unsubscribe_token!, 'likes')

    await sendLikeNotification(
      owners[0].email,
      owners[0].display_name!,
      likerName,
      targetType,
      targetUrl,
      unsubUrl
    )
  })
}

export function fireFollowNotification(followedUserId: string, followerId: string) {
  if (!db || !process.env.RESEND_API_KEY) return
  fireAndForget(async () => {
    if (followedUserId === followerId) return

    const owners = await db!.select({
      email: profiles.email,
      display_name: profiles.display_name,
      notify_follows: profiles.notify_follows,
      notification_unsubscribe_token: profiles.notification_unsubscribe_token,
    }).from(profiles).where(eq(profiles.id, followedUserId)).limit(1)
    if (!owners[0] || !owners[0].email || !owners[0].notify_follows) return

    if (await isDuplicate(followedUserId, 'follow', followerId, followerId)) return

    const followers = await db!.select({ display_name: profiles.display_name }).from(profiles)
      .where(eq(profiles.id, followerId)).limit(1)
    const followerName = followers[0]?.display_name || 'مستخدم'

    const followerUrl = `${APP_URL}/space/profile/${followerId}`
    const unsubUrl = unsubNotifUrl(owners[0].notification_unsubscribe_token!, 'follows')

    await sendFollowNotification(
      owners[0].email,
      owners[0].display_name!,
      followerName,
      followerUrl,
      unsubUrl
    )
  })
}
