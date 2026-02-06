import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { successResponse, errorResponse } from '@/lib/api-utils'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { searchParams } = new URL(request.url)

  const cursor = searchParams.get('cursor') // ISO timestamp
  const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 50)
  const sort = searchParams.get('sort') || 'newest'
  const tag = searchParams.get('tag')

  // Fetch articles
  let articlesQuery = supabase
    .from('hibr_articles')
    .select('*, profiles!hibr_articles_user_id_fkey(id, display_name, avatar_url, bio, is_admin, articles_count, followers_count)')
    .eq('status', 'published')
    .in('moderation_status', ['approved', 'pending'])
    .is('deleted_at', null)

  if (tag) articlesQuery = articlesQuery.contains('tags', [tag])
  if (cursor) articlesQuery = articlesQuery.lt('created_at', cursor)

  // Fetch thoughts
  let thoughtsQuery = supabase
    .from('hibr_thoughts')
    .select('*, profiles!hibr_thoughts_user_id_fkey(id, display_name, avatar_url, bio, articles_count, followers_count)')
    .in('moderation_status', ['approved', 'pending'])
    .is('deleted_at', null)

  if (tag) thoughtsQuery = thoughtsQuery.contains('tags', [tag])
  if (cursor) thoughtsQuery = thoughtsQuery.lt('created_at', cursor)

  const [articlesResult, thoughtsResult] = await Promise.all([
    articlesQuery.order('created_at', { ascending: false }).limit(limit),
    thoughtsQuery.order('created_at', { ascending: false }).limit(limit),
  ])

  if (articlesResult.error || thoughtsResult.error) {
    return errorResponse('حدث خطأ في جلب المحتوى', 500)
  }

  // Combine into unified feed items
  const articles = (articlesResult.data || []).map((a) => ({
    type: 'article' as const,
    id: a.id,
    data: a,
    featured: a.featured,
    timestamp: a.created_at,
  }))

  const thoughts = (thoughtsResult.data || []).map((t) => ({
    type: 'thought' as const,
    id: t.id,
    data: t,
    featured: false,
    timestamp: t.created_at,
  }))

  let items = [...articles, ...thoughts]

  // Sort
  switch (sort) {
    case 'popular':
      items.sort((a, b) => {
        const likesA = a.data.likes_count ?? 0
        const likesB = b.data.likes_count ?? 0
        return likesB - likesA
      })
      break
    case 'discussed':
      items.sort((a, b) => {
        const countA = a.type === 'article' ? (a.data.comments_count ?? 0) : (a.data.replies_count ?? 0)
        const countB = b.type === 'article' ? (b.data.comments_count ?? 0) : (b.data.replies_count ?? 0)
        return countB - countA
      })
      break
    case 'newest':
    default:
      items.sort((a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      )
  }

  items = items.slice(0, limit)

  const nextCursor = items.length === limit
    ? items[items.length - 1].timestamp
    : null

  return successResponse({ items, nextCursor })
}
