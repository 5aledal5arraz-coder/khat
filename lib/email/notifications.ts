import { pool } from '@/lib/db'
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
  if (!pool) return true // no DB = skip
  const { rowCount } = await pool.query(
    `INSERT INTO email_notifications_log (recipient_id, notification_type, trigger_user_id, target_id)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT DO NOTHING`,
    [recipientId, notificationType, triggerUserId, targetId]
  )
  return rowCount === 0 // 0 rows inserted = already existed
}

function unsubNotifUrl(token: string, type: string): string {
  return `${APP_URL}/api/unsubscribe/notifications?token=${token}&type=${type}`
}

// --- Public fire-and-forget triggers ---

export function fireWelcomeEmail(uid: string, email: string, displayName: string) {
  if (!pool || !process.env.RESEND_API_KEY) return
  fireAndForget(async () => {
    await sendWelcomeEmail(email, displayName)
  })
}

export function fireCommentNotification(articleId: string, commenterId: string, commentPreview: string) {
  if (!pool || !process.env.RESEND_API_KEY) return
  fireAndForget(async () => {
    // Look up article owner
    const { rows: articles } = await pool!.query(
      `SELECT user_id FROM hibr_articles WHERE id = $1`,
      [articleId]
    )
    if (!articles[0]) return
    const ownerId = articles[0].user_id

    // Don't notify yourself
    if (ownerId === commenterId) return

    // Check owner's preferences
    const { rows: owners } = await pool!.query(
      `SELECT email, display_name, notify_comments, notification_unsubscribe_token FROM profiles WHERE id = $1`,
      [ownerId]
    )
    if (!owners[0] || !owners[0].email || !owners[0].notify_comments) return

    // Dedup
    if (await isDuplicate(ownerId, 'comment', commenterId, articleId)) return

    // Look up commenter name
    const { rows: commenters } = await pool!.query(
      `SELECT display_name FROM profiles WHERE id = $1`,
      [commenterId]
    )
    const commenterName = commenters[0]?.display_name || 'مستخدم'

    // Look up article title
    const { rows: articleRows } = await pool!.query(
      `SELECT title FROM hibr_articles WHERE id = $1`,
      [articleId]
    )
    const articleTitle = articleRows[0]?.title || 'مقال'

    const articleUrl = `${APP_URL}/space/articles/${articleId}`
    const unsubUrl = unsubNotifUrl(owners[0].notification_unsubscribe_token, 'comments')

    await sendCommentNotification(
      owners[0].email,
      owners[0].display_name,
      commenterName,
      articleTitle,
      commentPreview.slice(0, 200),
      articleUrl,
      unsubUrl
    )
  })
}

export function fireReplyNotification(thoughtId: string, replierId: string, replyPreview: string) {
  if (!pool || !process.env.RESEND_API_KEY) return
  fireAndForget(async () => {
    // Look up thought owner
    const { rows: thoughts } = await pool!.query(
      `SELECT user_id FROM hibr_thoughts WHERE id = $1`,
      [thoughtId]
    )
    if (!thoughts[0]) return
    const ownerId = thoughts[0].user_id

    if (ownerId === replierId) return

    const { rows: owners } = await pool!.query(
      `SELECT email, display_name, notify_replies, notification_unsubscribe_token FROM profiles WHERE id = $1`,
      [ownerId]
    )
    if (!owners[0] || !owners[0].email || !owners[0].notify_replies) return

    if (await isDuplicate(ownerId, 'reply', replierId, thoughtId)) return

    const { rows: repliers } = await pool!.query(
      `SELECT display_name FROM profiles WHERE id = $1`,
      [replierId]
    )
    const replierName = repliers[0]?.display_name || 'مستخدم'

    const thoughtUrl = `${APP_URL}/space/thoughts/${thoughtId}`
    const unsubUrl = unsubNotifUrl(owners[0].notification_unsubscribe_token, 'replies')

    await sendReplyNotification(
      owners[0].email,
      owners[0].display_name,
      replierName,
      replyPreview.slice(0, 200),
      thoughtUrl,
      unsubUrl
    )
  })
}

export function fireLikeNotification(targetType: string, targetId: string, likerId: string) {
  if (!pool || !process.env.RESEND_API_KEY) return
  fireAndForget(async () => {
    // Map target type to table
    const tableMap: Record<string, string> = {
      article: 'hibr_articles',
      thought: 'hibr_thoughts',
      comment: 'hibr_comments',
      reply: 'hibr_replies',
    }
    const table = tableMap[targetType]
    if (!table) return

    const { rows: targets } = await pool!.query(
      `SELECT user_id FROM ${table} WHERE id = $1`,
      [targetId]
    )
    if (!targets[0]) return
    const ownerId = targets[0].user_id

    if (ownerId === likerId) return

    const { rows: owners } = await pool!.query(
      `SELECT email, display_name, notify_likes, notification_unsubscribe_token FROM profiles WHERE id = $1`,
      [ownerId]
    )
    if (!owners[0] || !owners[0].email || !owners[0].notify_likes) return

    if (await isDuplicate(ownerId, 'like', likerId, targetId)) return

    const { rows: likers } = await pool!.query(
      `SELECT display_name FROM profiles WHERE id = $1`,
      [likerId]
    )
    const likerName = likers[0]?.display_name || 'مستخدم'

    // Build URL based on target type
    const urlMap: Record<string, string> = {
      article: `${APP_URL}/space/articles/${targetId}`,
      thought: `${APP_URL}/space/thoughts/${targetId}`,
      comment: `${APP_URL}/space`,
      reply: `${APP_URL}/space`,
    }
    const targetUrl = urlMap[targetType] || `${APP_URL}/space`
    const unsubUrl = unsubNotifUrl(owners[0].notification_unsubscribe_token, 'likes')

    await sendLikeNotification(
      owners[0].email,
      owners[0].display_name,
      likerName,
      targetType,
      targetUrl,
      unsubUrl
    )
  })
}

export function fireFollowNotification(followedUserId: string, followerId: string) {
  if (!pool || !process.env.RESEND_API_KEY) return
  fireAndForget(async () => {
    if (followedUserId === followerId) return

    const { rows: owners } = await pool!.query(
      `SELECT email, display_name, notify_follows, notification_unsubscribe_token FROM profiles WHERE id = $1`,
      [followedUserId]
    )
    if (!owners[0] || !owners[0].email || !owners[0].notify_follows) return

    if (await isDuplicate(followedUserId, 'follow', followerId, followerId)) return

    const { rows: followers } = await pool!.query(
      `SELECT display_name FROM profiles WHERE id = $1`,
      [followerId]
    )
    const followerName = followers[0]?.display_name || 'مستخدم'

    const followerUrl = `${APP_URL}/space/profile/${followerId}`
    const unsubUrl = unsubNotifUrl(owners[0].notification_unsubscribe_token, 'follows')

    await sendFollowNotification(
      owners[0].email,
      owners[0].display_name,
      followerName,
      followerUrl,
      unsubUrl
    )
  })
}
