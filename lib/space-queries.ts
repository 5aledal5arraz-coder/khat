import { db, USE_DB } from '@/lib/db'
import { eq, and, desc, isNull, sql, arrayContains, arrayOverlaps, gte } from 'drizzle-orm'
import { hibrArticles, hibrThoughts, profiles } from '@/lib/db/schema'
import type { FeedItem } from '@/types/space'
import { getAuthorById as getMockAuthor, getTopContributors as getMockContributors } from '@/lib/space-authors'
import {
  getWeeklyHighlights as getMockHighlights,
  getArticleById as getMockArticle,
  getRelatedArticles as getMockRelated,
  getArticlesByAuthor as getMockByAuthor,
  mockArticles,
} from '@/lib/space-articles'
import { mockThoughts } from '@/lib/space-thoughts'
import {
  getUnifiedFeed as getMockFeed,
  type FeedSortOption,
  writingPrompts,
} from '@/lib/space-feed'
import type { Article, Author, Thought } from '@/types/space'

// Shared column selections for leftJoin queries
const articleColumns = {
  id: hibrArticles.id,
  user_id: hibrArticles.user_id,
  title: hibrArticles.title,
  excerpt: hibrArticles.excerpt,
  content: hibrArticles.content,
  cover_image: hibrArticles.cover_image,
  tags: hibrArticles.tags,
  episode_id: hibrArticles.episode_id,
  episode_title: hibrArticles.episode_title,
  episode_slug: hibrArticles.episode_slug,
  read_time_minutes: hibrArticles.read_time_minutes,
  likes_count: hibrArticles.likes_count,
  comments_count: hibrArticles.comments_count,
  status: hibrArticles.status,
  moderation_status: hibrArticles.moderation_status,
  featured: hibrArticles.featured,
  deleted_at: hibrArticles.deleted_at,
  created_at: hibrArticles.created_at,
  // Profile fields via leftJoin
  p_id: profiles.id,
  p_display_name: profiles.display_name,
  p_avatar_url: profiles.avatar_url,
  p_bio: profiles.bio,
  p_articles_count: profiles.articles_count,
  p_followers_count: profiles.followers_count,
}

const thoughtColumns = {
  id: hibrThoughts.id,
  user_id: hibrThoughts.user_id,
  content: hibrThoughts.content,
  tags: hibrThoughts.tags,
  likes_count: hibrThoughts.likes_count,
  replies_count: hibrThoughts.replies_count,
  moderation_status: hibrThoughts.moderation_status,
  deleted_at: hibrThoughts.deleted_at,
  created_at: hibrThoughts.created_at,
  // Profile fields via leftJoin
  p_id: profiles.id,
  p_display_name: profiles.display_name,
  p_avatar_url: profiles.avatar_url,
  p_bio: profiles.bio,
  p_articles_count: profiles.articles_count,
  p_followers_count: profiles.followers_count,
}

// Helper to convert Drizzle joined row to Article type
function dbToArticle(row: typeof articleColumns extends Record<string, infer _> ? Record<string, unknown> : never): Article {
  return {
    id: row.id as string,
    title: row.title as string,
    excerpt: (row.excerpt as string) || '',
    content: row.content as string,
    coverImage: row.cover_image as string | undefined,
    author: {
      id: (row.p_id as string) || (row.user_id as string),
      name: (row.p_display_name as string) || 'مجهول',
      avatar: row.p_avatar_url as string | undefined,
      bio: row.p_bio as string | undefined,
      articlesCount: (row.p_articles_count as number) || 0,
      followersCount: (row.p_followers_count as number) || 0,
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

// Helper to convert Drizzle joined row to Thought type
function dbToThought(row: Record<string, unknown>): Thought {
  return {
    id: row.id as string,
    content: row.content as string,
    author: {
      id: (row.p_id as string) || (row.user_id as string),
      name: (row.p_display_name as string) || 'مجهول',
      avatar: row.p_avatar_url as string | undefined,
      bio: row.p_bio as string | undefined,
      articlesCount: (row.p_articles_count as number) || 0,
      followersCount: (row.p_followers_count as number) || 0,
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

  const articleConditions = [
    eq(hibrArticles.status, 'published'),
    eq(hibrArticles.moderation_status, 'approved'),
    isNull(hibrArticles.deleted_at),
  ]

  const thoughtConditions = [
    eq(hibrThoughts.moderation_status, 'approved'),
    isNull(hibrThoughts.deleted_at),
  ]

  if (tag) {
    articleConditions.push(arrayContains(hibrArticles.tags, [tag]))
    thoughtConditions.push(arrayContains(hibrThoughts.tags, [tag]))
  }

  const [articleRows, thoughtRows] = await Promise.all([
    db!.select(articleColumns)
      .from(hibrArticles)
      .leftJoin(profiles, eq(hibrArticles.user_id, profiles.id))
      .where(and(...articleConditions))
      .orderBy(desc(hibrArticles.created_at))
      .limit(limit),
    db!.select(thoughtColumns)
      .from(hibrThoughts)
      .leftJoin(profiles, eq(hibrThoughts.user_id, profiles.id))
      .where(and(...thoughtConditions))
      .orderBy(desc(hibrThoughts.created_at))
      .limit(limit),
  ])

  const articleItems: FeedItem[] = articleRows.map((row) => ({
    type: 'article' as const,
    id: `article-${row.id}`,
    data: dbToArticle(row as Record<string, unknown>),
    featured: (row.featured as boolean) || false,
    timestamp: row.created_at ? row.created_at.toISOString() : new Date().toISOString(),
  }))

  const thoughtItems: FeedItem[] = thoughtRows.map((row) => ({
    type: 'thought' as const,
    id: `thought-${row.id}`,
    data: dbToThought(row as Record<string, unknown>),
    featured: false,
    timestamp: row.created_at ? row.created_at.toISOString() : new Date().toISOString(),
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

  const rows = await db!.select()
    .from(profiles)
    .where(sql`${profiles.articles_count} > 0`)
    .orderBy(desc(profiles.articles_count))
    .limit(5)

  if (rows.length === 0) return getMockContributors()

  return rows.map((p) => ({
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

  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  const rows = await db!.select(articleColumns)
    .from(hibrArticles)
    .leftJoin(profiles, eq(hibrArticles.user_id, profiles.id))
    .where(and(
      eq(hibrArticles.status, 'published'),
      eq(hibrArticles.moderation_status, 'approved'),
      isNull(hibrArticles.deleted_at),
      gte(hibrArticles.created_at, oneWeekAgo),
    ))
    .orderBy(desc(hibrArticles.likes_count))
    .limit(3)

  if (rows.length === 0) return getMockHighlights()
  return rows.map((row) => dbToArticle(row as Record<string, unknown>))
}

export async function getArticleById(id: string): Promise<Article | undefined> {
  if (!USE_DB) return getMockArticle(id)

  const rows = await db!.select(articleColumns)
    .from(hibrArticles)
    .leftJoin(profiles, eq(hibrArticles.user_id, profiles.id))
    .where(and(
      eq(hibrArticles.id, id),
      isNull(hibrArticles.deleted_at),
    ))
    .limit(1)

  if (rows.length === 0) return getMockArticle(id)
  return dbToArticle(rows[0] as Record<string, unknown>)
}

export async function getRelatedArticles(currentId: string, tags: string[], limit = 3): Promise<Article[]> {
  if (!USE_DB) return getMockRelated(currentId, tags, limit)

  const rows = await db!.select(articleColumns)
    .from(hibrArticles)
    .leftJoin(profiles, eq(hibrArticles.user_id, profiles.id))
    .where(and(
      sql`${hibrArticles.id} != ${currentId}`,
      eq(hibrArticles.status, 'published'),
      eq(hibrArticles.moderation_status, 'approved'),
      isNull(hibrArticles.deleted_at),
      arrayOverlaps(hibrArticles.tags, tags),
    ))
    .limit(limit)

  if (rows.length === 0) return getMockRelated(currentId, tags, limit)
  return rows.map((row) => dbToArticle(row as Record<string, unknown>))
}

export async function getArticlesByAuthor(authorId: string): Promise<Article[]> {
  if (!USE_DB) return getMockByAuthor(authorId)

  const rows = await db!.select(articleColumns)
    .from(hibrArticles)
    .leftJoin(profiles, eq(hibrArticles.user_id, profiles.id))
    .where(and(
      eq(hibrArticles.user_id, authorId),
      eq(hibrArticles.status, 'published'),
      eq(hibrArticles.moderation_status, 'approved'),
      isNull(hibrArticles.deleted_at),
    ))
    .orderBy(desc(hibrArticles.created_at))

  if (rows.length === 0) return getMockByAuthor(authorId)
  return rows.map((row) => dbToArticle(row as Record<string, unknown>))
}

export async function getAuthorById(id: string): Promise<Author | undefined> {
  if (!USE_DB) return getMockAuthor(id)

  const rows = await db!.select()
    .from(profiles)
    .where(eq(profiles.id, id))
    .limit(1)

  if (rows.length === 0) return getMockAuthor(id)
  const data = rows[0]
  return {
    id: data.id,
    name: data.display_name || 'مجهول',
    avatar: data.avatar_url || undefined,
    bio: data.bio || undefined,
    articlesCount: data.articles_count || 0,
    followersCount: data.followers_count || 0,
  }
}

export async function getArticlesByEpisodeId(episodeId: string): Promise<Article[]> {
  if (!USE_DB) {
    return mockArticles.filter((a) => a.episodeId === episodeId).slice(0, 5)
  }

  const rows = await db!.select(articleColumns)
    .from(hibrArticles)
    .leftJoin(profiles, eq(hibrArticles.user_id, profiles.id))
    .where(and(
      eq(hibrArticles.episode_id, episodeId),
      eq(hibrArticles.status, 'published'),
      eq(hibrArticles.moderation_status, 'approved'),
      isNull(hibrArticles.deleted_at),
    ))
    .orderBy(desc(hibrArticles.created_at))
    .limit(5)

  if (rows.length === 0) {
    return mockArticles.filter((a) => a.episodeId === episodeId).slice(0, 5)
  }
  return rows.map((row) => dbToArticle(row as Record<string, unknown>))
}

// Re-export unchanged data
export { writingPrompts, mockArticles, mockThoughts }
export type { FeedSortOption }
