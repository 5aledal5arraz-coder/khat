import { NextRequest } from 'next/server'
import { db, PROFILE_COLS, nestProfile } from '@/lib/db'
import {
  getAdminAuthUser,
  getUserProfile,
  unauthorizedResponse,
  forbiddenResponse,
  successResponse,
  errorResponse,
} from '@/lib/api-utils'
import { sql } from 'drizzle-orm'

export async function GET(request: NextRequest) {
  const user = await getAdminAuthUser()
  if (!user) return unauthorizedResponse()

  const profile = await getUserProfile(user.id)
  if (!profile?.is_admin) return forbiddenResponse()

  const { searchParams } = new URL(request.url)

  const tab = searchParams.get('tab') || 'pending' // pending | flagged | reports
  const page = Math.max(1, parseInt(searchParams.get('page') || '1') || 1)
  const limit = 20
  const offset = (page - 1) * limit

  if (tab === 'reports') {
    try {
      const result = await db!.execute(sql`SELECT r.*, ${sql.raw(PROFILE_COLS)}, COUNT(*) OVER() AS _total
         FROM hibr_reports r LEFT JOIN profiles p ON r.reporter_id = p.id
         WHERE r.status = 'pending'
         ORDER BY r.created_at DESC
         LIMIT ${limit} OFFSET ${offset}`)

      const rows = result.rows as Record<string, unknown>[]
      const total = rows.length > 0 ? Number(rows[0]._total) : 0
      const items = rows.map((row) => {
        const { _total, ...rest } = row
        return nestProfile(rest)
      })

      return successResponse({ items, total, tab })
    } catch {
      return errorResponse('حدث خطأ', 500)
    }
  }

  // Fetch pending/flagged articles, thoughts, comments, and replies
  const status = tab === 'flagged' ? 'auto_flagged' : 'pending'

  try {
    const [articles, thoughts, comments, replies] = await Promise.all([
      db!.execute(sql`SELECT a.*, ${sql.raw(PROFILE_COLS)}, COUNT(*) OVER() AS _total
         FROM hibr_articles a LEFT JOIN profiles p ON a.user_id = p.id
         WHERE a.moderation_status = ${status} AND a.deleted_at IS NULL
         ORDER BY a.created_at DESC LIMIT ${limit} OFFSET ${offset}`),
      db!.execute(sql`SELECT t.*, ${sql.raw(PROFILE_COLS)}, COUNT(*) OVER() AS _total
         FROM hibr_thoughts t LEFT JOIN profiles p ON t.user_id = p.id
         WHERE t.moderation_status = ${status} AND t.deleted_at IS NULL
         ORDER BY t.created_at DESC LIMIT ${limit} OFFSET ${offset}`),
      db!.execute(sql`SELECT c.*, ${sql.raw(PROFILE_COLS)}, COUNT(*) OVER() AS _total
         FROM hibr_comments c LEFT JOIN profiles p ON c.user_id = p.id
         WHERE c.moderation_status = ${status} AND c.deleted_at IS NULL
         ORDER BY c.created_at DESC LIMIT ${limit} OFFSET ${offset}`),
      db!.execute(sql`SELECT r.*, ${sql.raw(PROFILE_COLS)}, COUNT(*) OVER() AS _total
         FROM hibr_replies r LEFT JOIN profiles p ON r.user_id = p.id
         WHERE r.moderation_status = ${status} AND r.deleted_at IS NULL
         ORDER BY r.created_at DESC LIMIT ${limit} OFFSET ${offset}`),
    ])

    const extractTotal = (rows: Record<string, unknown>[]) =>
      rows.length > 0 ? Number(rows[0]._total) : 0

    const stripTotal = (rows: Record<string, unknown>[]) =>
      rows.map((row) => {
        const { _total, ...rest } = row
        return nestProfile(rest)
      })

    const items = [
      ...stripTotal(articles.rows as Record<string, unknown>[]).map((a) => ({ ...a, _type: 'article' as const })),
      ...stripTotal(thoughts.rows as Record<string, unknown>[]).map((t) => ({ ...t, _type: 'thought' as const })),
      ...stripTotal(comments.rows as Record<string, unknown>[]).map((c) => ({ ...c, _type: 'comment' as const })),
      ...stripTotal(replies.rows as Record<string, unknown>[]).map((r) => ({ ...r, _type: 'reply' as const })),
    ].sort((a, b) => new Date((b as Record<string, unknown>).created_at as string).getTime() - new Date((a as Record<string, unknown>).created_at as string).getTime())

    const total = extractTotal(articles.rows as Record<string, unknown>[]) + extractTotal(thoughts.rows as Record<string, unknown>[]) + extractTotal(comments.rows as Record<string, unknown>[]) + extractTotal(replies.rows as Record<string, unknown>[])

    return successResponse({ items, total, tab })
  } catch {
    return errorResponse('حدث خطأ', 500)
  }
}
