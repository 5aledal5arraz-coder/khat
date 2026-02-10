import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { successResponse, errorResponse } from '@/lib/api-utils'

const ARTICLES_SELECT = '*, profiles!hibr_articles_user_id_fkey(id, display_name, avatar_url, bio, is_admin, articles_count, followers_count)'
const THOUGHTS_SELECT = '*, profiles!hibr_thoughts_user_id_fkey(id, display_name, avatar_url, bio, articles_count, followers_count)'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { searchParams } = new URL(request.url)

  const limit = Math.min(Math.max(1, parseInt(searchParams.get('limit') || '20') || 20), 50)
  const sort = searchParams.get('sort') || 'newest'
  const tag = searchParams.get('tag')

  // Build base queries with shared filters
  function baseArticlesQuery() {
    let q = supabase
      .from('hibr_articles')
      .select(ARTICLES_SELECT)
      .eq('status', 'published')
      .in('moderation_status', ['approved', 'pending'])
      .is('deleted_at', null)
    if (tag) q = q.contains('tags', [tag])
    return q
  }

  function baseThoughtsQuery() {
    let q = supabase
      .from('hibr_thoughts')
      .select(THOUGHTS_SELECT)
      .in('moderation_status', ['approved', 'pending'])
      .is('deleted_at', null)
    if (tag) q = q.contains('tags', [tag])
    return q
  }

  // Map raw DB rows into unified feed items
  function toFeedItems(
    articles: Record<string, unknown>[],
    thoughts: Record<string, unknown>[],
  ) {
    const articleItems = articles.map((a) => ({
      type: 'article' as const,
      id: a.id as string,
      data: a,
      featured: (a.featured as boolean) || false,
      timestamp: a.created_at as string,
    }))
    const thoughtItems = thoughts.map((t) => ({
      type: 'thought' as const,
      id: t.id as string,
      data: t,
      featured: false,
      timestamp: t.created_at as string,
    }))
    return [...articleItems, ...thoughtItems]
  }

  // --- "newest" uses cursor-based pagination (timestamp) ---
  if (sort === 'newest') {
    const cursor = searchParams.get('cursor') // ISO timestamp

    let aq = baseArticlesQuery()
    let tq = baseThoughtsQuery()

    if (cursor) {
      aq = aq.lt('created_at', cursor)
      tq = tq.lt('created_at', cursor)
    }

    const [articlesResult, thoughtsResult] = await Promise.all([
      aq.order('created_at', { ascending: false }).limit(limit),
      tq.order('created_at', { ascending: false }).limit(limit),
    ])

    if (articlesResult.error || thoughtsResult.error) {
      return errorResponse('حدث خطأ في جلب المحتوى', 500)
    }

    let items = toFeedItems(
      (articlesResult.data || []) as Record<string, unknown>[],
      (thoughtsResult.data || []) as Record<string, unknown>[],
    )

    // Sort merged results by date descending, then take `limit`
    items.sort((a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    )
    items = items.slice(0, limit)

    const nextCursor = items.length === limit
      ? items[items.length - 1].timestamp
      : null

    return successResponse({ items, nextCursor, nextOffset: null })
  }

  // --- "popular" / "discussed" use offset-based pagination ---
  const offset = Math.max(0, parseInt(searchParams.get('offset') || '0') || 0)

  // We need to fetch enough from each table to cover the merged offset + limit.
  // Each table contributes an unknown share, so fetch (offset + limit) from each.
  const fetchCount = Math.min(offset + limit, 200) // Cap to prevent abuse

  const articleOrder = sort === 'popular' ? 'likes_count' : 'comments_count'
  const thoughtOrder = sort === 'popular' ? 'likes_count' : 'replies_count'

  const [articlesResult, thoughtsResult] = await Promise.all([
    baseArticlesQuery()
      .order(articleOrder, { ascending: false })
      .order('created_at', { ascending: false }) // Tiebreaker for stable ordering
      .limit(fetchCount),
    baseThoughtsQuery()
      .order(thoughtOrder, { ascending: false })
      .order('created_at', { ascending: false })
      .limit(fetchCount),
  ])

  if (articlesResult.error || thoughtsResult.error) {
    return errorResponse('حدث خطأ في جلب المحتوى', 500)
  }

  let items = toFeedItems(
    (articlesResult.data || []) as Record<string, unknown>[],
    (thoughtsResult.data || []) as Record<string, unknown>[],
  )

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
}
