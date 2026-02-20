import { NextRequest } from 'next/server'
import { db, PROFILE_COLS, nestProfile } from '@/lib/db'
import { successResponse, errorResponse } from '@/lib/api-utils'
import { sql } from 'drizzle-orm'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)

  const limit = Math.min(Math.max(1, parseInt(searchParams.get('limit') || '20') || 20), 50)
  const sort = searchParams.get('sort') || 'newest'
  const tag = searchParams.get('tag')

  // Map raw DB rows into unified feed items
  function toFeedItems(
    articles: Record<string, unknown>[],
    thoughts: Record<string, unknown>[],
  ) {
    const articleItems = articles.map((row) => {
      const a = nestProfile(row)
      return {
        type: 'article' as const,
        id: a.id as string,
        data: a,
        featured: (a.featured as boolean) || false,
        timestamp: a.created_at as string,
      }
    })
    const thoughtItems = thoughts.map((row) => {
      const t = nestProfile(row)
      return {
        type: 'thought' as const,
        id: t.id as string,
        data: t,
        featured: false,
        timestamp: t.created_at as string,
      }
    })
    return [...articleItems, ...thoughtItems]
  }

  // --- "newest" uses cursor-based pagination (timestamp) ---
  if (sort === 'newest') {
    const cursor = searchParams.get('cursor') // ISO timestamp

    try {
      const [articlesResult, thoughtsResult] = await Promise.all([
        cursor
          ? db!.execute(sql`SELECT a.*, ${sql.raw(PROFILE_COLS)}
             FROM hibr_articles a LEFT JOIN profiles p ON a.user_id = p.id
             WHERE a.status = 'published' AND a.moderation_status IN ('approved', 'pending') AND a.deleted_at IS NULL
             ${tag ? sql`AND a.tags @> ARRAY[${tag}]::text[]` : sql``}
             AND a.created_at < ${cursor}
             ORDER BY a.created_at DESC LIMIT ${limit}`)
          : db!.execute(sql`SELECT a.*, ${sql.raw(PROFILE_COLS)}
             FROM hibr_articles a LEFT JOIN profiles p ON a.user_id = p.id
             WHERE a.status = 'published' AND a.moderation_status IN ('approved', 'pending') AND a.deleted_at IS NULL
             ${tag ? sql`AND a.tags @> ARRAY[${tag}]::text[]` : sql``}
             ORDER BY a.created_at DESC LIMIT ${limit}`),
        cursor
          ? db!.execute(sql`SELECT t.*, ${sql.raw(PROFILE_COLS)}
             FROM hibr_thoughts t LEFT JOIN profiles p ON t.user_id = p.id
             WHERE t.moderation_status IN ('approved', 'pending') AND t.deleted_at IS NULL
             ${tag ? sql`AND t.tags @> ARRAY[${tag}]::text[]` : sql``}
             AND t.created_at < ${cursor}
             ORDER BY t.created_at DESC LIMIT ${limit}`)
          : db!.execute(sql`SELECT t.*, ${sql.raw(PROFILE_COLS)}
             FROM hibr_thoughts t LEFT JOIN profiles p ON t.user_id = p.id
             WHERE t.moderation_status IN ('approved', 'pending') AND t.deleted_at IS NULL
             ${tag ? sql`AND t.tags @> ARRAY[${tag}]::text[]` : sql``}
             ORDER BY t.created_at DESC LIMIT ${limit}`),
      ])

      let items = toFeedItems(articlesResult.rows as Record<string, unknown>[], thoughtsResult.rows as Record<string, unknown>[])

      // Sort merged results by date descending, then take `limit`
      items.sort((a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      )
      items = items.slice(0, limit)

      const nextCursor = items.length === limit
        ? items[items.length - 1].timestamp
        : null

      return successResponse({ items, nextCursor, nextOffset: null })
    } catch {
      return errorResponse('حدث خطأ في جلب المحتوى', 500)
    }
  }

  // --- "popular" / "discussed" use offset-based pagination ---
  const offset = Math.max(0, parseInt(searchParams.get('offset') || '0') || 0)

  // Fetch enough from each table to cover the merged offset + limit.
  const fetchCount = Math.min(offset + limit, 200) // Cap to prevent abuse

  const articleOrderSql = sort === 'popular'
    ? sql`a.likes_count DESC, a.created_at DESC`
    : sql`a.comments_count DESC, a.created_at DESC`
  const thoughtOrderSql = sort === 'popular'
    ? sql`t.likes_count DESC, t.created_at DESC`
    : sql`t.replies_count DESC, t.created_at DESC`

  try {
    const [articlesResult, thoughtsResult] = await Promise.all([
      db!.execute(sql`SELECT a.*, ${sql.raw(PROFILE_COLS)}
         FROM hibr_articles a LEFT JOIN profiles p ON a.user_id = p.id
         WHERE a.status = 'published' AND a.moderation_status IN ('approved', 'pending') AND a.deleted_at IS NULL
         ${tag ? sql`AND a.tags @> ARRAY[${tag}]::text[]` : sql``}
         ORDER BY ${articleOrderSql} LIMIT ${fetchCount}`),
      db!.execute(sql`SELECT t.*, ${sql.raw(PROFILE_COLS)}
         FROM hibr_thoughts t LEFT JOIN profiles p ON t.user_id = p.id
         WHERE t.moderation_status IN ('approved', 'pending') AND t.deleted_at IS NULL
         ${tag ? sql`AND t.tags @> ARRAY[${tag}]::text[]` : sql``}
         ORDER BY ${thoughtOrderSql} LIMIT ${fetchCount}`),
    ])

    let items = toFeedItems(articlesResult.rows as Record<string, unknown>[], thoughtsResult.rows as Record<string, unknown>[])

    // Sort by the relevant metric, with date as tiebreaker
    if (sort === 'popular') {
      items.sort((a, b) => {
        const likesA = (a.data as Record<string, unknown>).likes_count as number ?? 0
        const likesB = (b.data as Record<string, unknown>).likes_count as number ?? 0
        if (likesB !== likesA) return likesB - likesA
        return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      })
    } else {
      // discussed
      items.sort((a, b) => {
        const data_a = a.data as Record<string, unknown>
        const data_b = b.data as Record<string, unknown>
        const countA = a.type === 'article'
          ? (data_a.comments_count as number ?? 0)
          : (data_a.replies_count as number ?? 0)
        const countB = b.type === 'article'
          ? (data_b.comments_count as number ?? 0)
          : (data_b.replies_count as number ?? 0)
        if (countB !== countA) return countB - countA
        return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      })
    }

    // Apply offset + limit on the merged, sorted result
    const page = items.slice(offset, offset + limit)
    const hasMore = offset + limit < items.length

    return successResponse({
      items: page,
      nextCursor: null,
      nextOffset: hasMore ? offset + limit : null,
    })
  } catch {
    return errorResponse('حدث خطأ في جلب المحتوى', 500)
  }
}
