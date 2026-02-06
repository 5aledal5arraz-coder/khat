import { createClient } from '@/lib/supabase/server'
import type { FeedItem } from '@/types/space'
import {
  getUnifiedFeed as getMockFeed,
  getTopContributors as getMockContributors,
  getWeeklyHighlights as getMockHighlights,
  getArticleById as getMockArticle,
  getRelatedArticles as getMockRelated,
  getArticlesByAuthor as getMockByAuthor,
  getAuthorById as getMockAuthor,
  type FeedSortOption,
  writingPrompts,
  mockArticles,
  mockThoughts,
} from '@/lib/space-data'
import type { Article, Author, Thought } from '@/types/space'

const USE_DB = process.env.NEXT_PUBLIC_HIBR_USE_DB === 'true'

// Helper to convert DB row to Article type
function dbToArticle(row: Record<string, unknown>): Article {
  const profile = row.profiles as Record<string, unknown> | null
  return {
    id: row.id as string,
    title: row.title as string,
    excerpt: (row.excerpt as string) || '',
    content: row.content as string,
    coverImage: row.cover_image as string | undefined,
    author: {
      id: profile?.id as string || row.user_id as string,
      name: (profile?.display_name as string) || 'مجهول',
      avatar: profile?.avatar_url as string | undefined,
      bio: profile?.bio as string | undefined,
      articlesCount: (profile?.articles_count as number) || 0,
      followersCount: (profile?.followers_count as number) || 0,
    },
    date: row.created_at as string,
    readTime: `${row.read_time_minutes || 1} دقائق`,
    readTimeMinutes: (row.read_time_minutes as number) || 1,
    likes: (row.likes_count as number) || 0,
    comments: [],
    tags: (row.tags as string[]) || [],
    featured: (row.featured as boolean) || false,
    episodeId: row.episode_id as string | undefined,
    episodeTitle: row.episode_title as string | undefined,
    episodeSlug: row.episode_slug as string | undefined,
  }
}

// Helper to convert DB row to Thought type
function dbToThought(row: Record<string, unknown>): Thought {
  const profile = row.profiles as Record<string, unknown> | null
  return {
    id: row.id as string,
    content: row.content as string,
    author: {
      id: profile?.id as string || row.user_id as string,
      name: (profile?.display_name as string) || 'مجهول',
      avatar: profile?.avatar_url as string | undefined,
      bio: profile?.bio as string | undefined,
      articlesCount: (profile?.articles_count as number) || 0,
      followersCount: (profile?.followers_count as number) || 0,
    },
    date: row.created_at as string,
    likes: (row.likes_count as number) || 0,
    replies: [],
    tags: (row.tags as string[]) || [],
  }
}

export async function getUnifiedFeed(options: {
  sort?: FeedSortOption
  tag?: string
  limit?: number
}): Promise<FeedItem[]> {
  if (!USE_DB) return getMockFeed(options)

  const { sort = 'newest', tag, limit = 30 } = options
  const supabase = await createClient()

  let articlesQuery = supabase
    .from('hibr_articles')
    .select('*, profiles!hibr_articles_user_id_fkey(id, display_name, avatar_url, bio, articles_count, followers_count)')
    .eq('status', 'published')
    .in('moderation_status', ['approved', 'pending'])
    .is('deleted_at', null)

  let thoughtsQuery = supabase
    .from('hibr_thoughts')
    .select('*, profiles!hibr_thoughts_user_id_fkey(id, display_name, avatar_url, bio, articles_count, followers_count)')
    .in('moderation_status', ['approved', 'pending'])
    .is('deleted_at', null)

  if (tag) {
    articlesQuery = articlesQuery.contains('tags', [tag])
    thoughtsQuery = thoughtsQuery.contains('tags', [tag])
  }

  const [articlesResult, thoughtsResult] = await Promise.all([
    articlesQuery.order('created_at', { ascending: false }).limit(limit),
    thoughtsQuery.order('created_at', { ascending: false }).limit(limit),
  ])

  const articleItems: FeedItem[] = (articlesResult.data || []).map((row) => ({
    type: 'article' as const,
    id: `article-${row.id}`,
    data: dbToArticle(row),
    featured: row.featured || false,
    timestamp: row.created_at,
  }))

  const thoughtItems: FeedItem[] = (thoughtsResult.data || []).map((row) => ({
    type: 'thought' as const,
    id: `thought-${row.id}`,
    data: dbToThought(row),
    featured: false,
    timestamp: row.created_at,
  }))

  let items = [...articleItems, ...thoughtItems]

  switch (sort) {
    case 'popular':
      items.sort((a, b) => b.data.likes - a.data.likes)
      break
    case 'discussed':
      items.sort((a, b) => {
        const countA = a.type === 'article' ? (a.data as Article).comments.length : (a.data as Thought).replies.length
        const countB = b.type === 'article' ? (b.data as Article).comments.length : (b.data as Thought).replies.length
        return countB - countA
      })
      break
    default:
      items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
  }

  return items.slice(0, limit)
}

export async function getTopContributors(): Promise<Author[]> {
  if (!USE_DB) return getMockContributors()

  const supabase = await createClient()
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .gt('articles_count', 0)
    .order('articles_count', { ascending: false })
    .limit(5)

  if (!data || data.length === 0) return getMockContributors()

  return data.map((p) => ({
    id: p.id,
    name: p.display_name || 'مجهول',
    avatar: p.avatar_url || undefined,
    bio: p.bio || undefined,
    articlesCount: p.articles_count || 0,
    followersCount: p.followers_count || 0,
  }))
}

export async function getWeeklyHighlights(): Promise<Article[]> {
  if (!USE_DB) return getMockHighlights()

  const supabase = await createClient()
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const { data } = await supabase
    .from('hibr_articles')
    .select('*, profiles!hibr_articles_user_id_fkey(id, display_name, avatar_url, bio, articles_count, followers_count)')
    .eq('status', 'published')
    .eq('moderation_status', 'approved')
    .is('deleted_at', null)
    .gte('created_at', oneWeekAgo)
    .order('likes_count', { ascending: false })
    .limit(3)

  if (!data || data.length === 0) return getMockHighlights()
  return data.map(dbToArticle)
}

export async function getArticleById(id: string): Promise<Article | undefined> {
  if (!USE_DB) return getMockArticle(id)

  const supabase = await createClient()
  const { data } = await supabase
    .from('hibr_articles')
    .select('*, profiles!hibr_articles_user_id_fkey(id, display_name, avatar_url, bio, articles_count, followers_count)')
    .eq('id', id)
    .is('deleted_at', null)
    .single()

  if (!data) return getMockArticle(id)
  return dbToArticle(data)
}

export async function getRelatedArticles(currentId: string, tags: string[], limit = 3): Promise<Article[]> {
  if (!USE_DB) return getMockRelated(currentId, tags, limit)

  const supabase = await createClient()
  const { data } = await supabase
    .from('hibr_articles')
    .select('*, profiles!hibr_articles_user_id_fkey(id, display_name, avatar_url, bio, articles_count, followers_count)')
    .neq('id', currentId)
    .eq('status', 'published')
    .in('moderation_status', ['approved', 'pending'])
    .is('deleted_at', null)
    .overlaps('tags', tags)
    .limit(limit)

  if (!data || data.length === 0) return getMockRelated(currentId, tags, limit)
  return data.map(dbToArticle)
}

export async function getArticlesByAuthor(authorId: string): Promise<Article[]> {
  if (!USE_DB) return getMockByAuthor(authorId)

  const supabase = await createClient()
  const { data } = await supabase
    .from('hibr_articles')
    .select('*, profiles!hibr_articles_user_id_fkey(id, display_name, avatar_url, bio, articles_count, followers_count)')
    .eq('user_id', authorId)
    .eq('status', 'published')
    .in('moderation_status', ['approved', 'pending'])
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  if (!data || data.length === 0) return getMockByAuthor(authorId)
  return data.map(dbToArticle)
}

export async function getAuthorById(id: string): Promise<Author | undefined> {
  if (!USE_DB) return getMockAuthor(id)

  const supabase = await createClient()
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', id)
    .single()

  if (!data) return getMockAuthor(id)
  return {
    id: data.id,
    name: data.display_name || 'مجهول',
    avatar: data.avatar_url || undefined,
    bio: data.bio || undefined,
    articlesCount: data.articles_count || 0,
    followersCount: data.followers_count || 0,
  }
}

// Re-export unchanged data
export { writingPrompts, mockArticles, mockThoughts }
export type { FeedSortOption }
