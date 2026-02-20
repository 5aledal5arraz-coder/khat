import { db, USE_DB as DB_AVAILABLE } from "@/lib/db"
import { eq, desc, sql, and, asc, ilike, ne, gte, inArray } from 'drizzle-orm'
import {
  episodes,
  guests,
  topics,
  episodeTopics,
  timestamps as timestampsTable,
  quotes as quotesTable,
  resources as resourcesTable,
  newsletterSubscribers,
  sponsorshipLeads,
  guestApplications,
} from '@/lib/db/schema'
import type {
  Episode,
  Guest,
  Topic,
  Timestamp,
  Quote,
  Resource,
  EpisodeWithRelations,
  GuestWithRelations
} from '@/types/database'
import {
  mockGuests,
  mockTopics,
  mockTimestamps,
  mockQuotes,
  mockResources
} from '@/lib/mocks/episodes'
import {
  fetchEpisodeBySlug,
  fetchLatestEpisode,
  fetchMostViewedRecent,
} from '@/lib/youtube/queries'
import { getCachedEpisodes } from '@/lib/cache/episode-cache'
import { getEpisodeOverrides, applyOverrides } from '@/lib/episode-overrides'
import { getHiddenEpisodeIds, getSectionsConfig } from '@/lib/episode-sections'
import { getGuestAssignments, applyGuestAssignments } from '@/lib/episode-guests'
import { getAllGuests } from '@/lib/admin/queries'
import { searchEpisodes, searchGuests } from '@/lib/search'
import { getPublishedQuotes } from '@/lib/episode-quotes'
import { getEpisodeEnrichment } from '@/lib/episode-enrichments'
import { mergeEpisodeLists, mergeEpisode } from '@/lib/episodes/merge'

const USE_MOCK_DATA = !DB_AVAILABLE
const USE_YOUTUBE = !!process.env.YOUTUBE_API_KEY
const USE_DB = DB_AVAILABLE

// Helper: construct an Episode from a Drizzle leftJoin row (episodes + guests)
function nestEpisodeWithGuest(row: {
  episodes: typeof episodes.$inferSelect
  guests: typeof guests.$inferSelect | null
}): Partial<Episode> {
  const ep = row.episodes
  const g = row.guests
  return {
    ...ep,
    release_date: String(ep.release_date),
    created_at: ep.created_at ? ep.created_at.toISOString() : new Date().toISOString(),
    updated_at: ep.updated_at ? ep.updated_at.toISOString() : undefined,
    guest: g
      ? {
          id: g.id,
          name: g.name,
          slug: g.slug,
          bio: g.bio,
          photo_url: g.photo_url,
          external_links: g.external_links,
          testimonial: g.testimonial,
          created_at: g.created_at ? g.created_at.toISOString() : new Date().toISOString(),
        }
      : null,
  } as Partial<Episode>
}

async function fetchDbEpisodes(): Promise<Partial<Episode>[]> {
  if (!USE_DB) return []
  try {
    const rows = await db!
      .select()
      .from(episodes)
      .leftJoin(guests, eq(episodes.guest_id, guests.id))
      .orderBy(desc(episodes.release_date))

    return (rows || []).map(nestEpisodeWithGuest)
  } catch {
    return []
  }
}

async function fetchDbEpisodeById(id: string): Promise<Partial<Episode> | null> {
  if (!USE_DB) return null
  try {
    const rows = await db!
      .select()
      .from(episodes)
      .leftJoin(guests, eq(episodes.guest_id, guests.id))
      .where(eq(episodes.id, id))

    if (!rows || rows.length === 0) return null
    return nestEpisodeWithGuest(rows[0])
  } catch {
    return null
  }
}

// Filter episodes by admin section assignments (with keyword fallback for unassigned)
function filterByCategory(
  episodes: Episode[],
  category: string,
  assignments: Record<string, string> = {}
): Episode[] {
  return episodes.filter((e) => {
    // If the episode is explicitly assigned to this section in admin, include it
    if (assignments[e.id] === category) return true
    // If the episode is assigned to a different section, exclude it
    if (assignments[e.id]) return false
    // For unassigned episodes, fall back to keyword/heuristic matching
    switch (category) {
      case 'season-1':
        return (
          e.title.includes('الموسم الأول') ||
          e.title.includes('موسم 1') ||
          e.season === 1 ||
          (e.episode_number != null && e.episode_number <= 30)
        )
      case 'season-2':
        return (
          e.title.includes('الموسم الثاني') ||
          e.title.includes('موسم 2') ||
          e.season === 2 ||
          (e.episode_number != null && e.episode_number > 30)
        )
      case 'clips':
        return (
          e.title.includes('مقاطع') ||
          e.title.includes('مقطع') ||
          e.title.includes('clips') ||
          e.duration_minutes < 15
        )
      case 'unpublished':
      case 'unreleased':
        return (
          e.title.includes('غير منشور') ||
          e.title.includes('حصري') ||
          e.title.includes('خاص')
        )
      default:
        // For custom sections, only admin assignments count
        return false
    }
  })
}

export async function getEpisodes(options?: {
  topicSlug?: string
  guestSlug?: string
  season?: number
  search?: string
  category?: string
  limit?: number
  offset?: number
  includeHidden?: boolean
}): Promise<Episode[]> {
  // Get episode overrides, hidden IDs, section assignments, and guest assignments
  const [overrides, hiddenIds, sectionsConfig, guestAssignments, guestList] = await Promise.all([
    getEpisodeOverrides(),
    options?.includeHidden ? Promise.resolve(new Set<string>()) : getHiddenEpisodeIds(),
    getSectionsConfig(),
    getGuestAssignments(),
    getAllGuests(),
  ])
  const { assignments } = sectionsConfig

  const filterHidden = (eps: Episode[]) =>
    hiddenIds.size > 0 ? eps.filter((e) => !hiddenIds.has(e.id)) : eps

  // Try YouTube first if available
  if (USE_YOUTUBE) {
    try {
      // Fetch ALL episodes first, then filter — pagination must happen last
      const [ytEpisodes, dbEpisodes] = await Promise.all([
        getCachedEpisodes(),
        fetchDbEpisodes(),
      ])

      // Merge: DB fields win per-field, YouTube provides live stats
      let episodes = mergeEpisodeLists(ytEpisodes, dbEpisodes)

      // Apply title/description overrides
      episodes = applyOverrides(episodes, overrides)

      // Apply admin guest assignments
      episodes = applyGuestAssignments(episodes, guestAssignments, guestList)

      // Filter by category
      if (options?.category) {
        episodes = filterByCategory(episodes, options.category, assignments)
      }

      episodes = filterHidden(episodes)

      // Apply Arabic-aware search
      if (options?.search) {
        episodes = searchEpisodes(episodes, options.search)
      }

      // Paginate last
      if (options?.limit) {
        episodes = episodes.slice(options?.offset || 0, (options?.offset || 0) + options.limit)
      }

      return episodes
    } catch (error) {
      console.error('YouTube fetch failed, falling back:', error)
    }
  }

  if (USE_MOCK_DATA) {
    const { mockEpisodes } = await import('@/lib/mocks/episodes')
    let episodes = [...mockEpisodes]

    // Filter by category
    if (options?.category) {
      episodes = filterByCategory(episodes, options.category, assignments)
    }

    if (options?.season) {
      episodes = episodes.filter(e => e.season === options.season)
    }

    if (options?.guestSlug) {
      episodes = episodes.filter(e => e.guest?.slug === options.guestSlug)
    }

    episodes = filterHidden(episodes)

    // Apply Arabic-aware search
    if (options?.search) {
      episodes = searchEpisodes(episodes, options.search)
    }

    if (options?.limit) {
      episodes = episodes.slice(options?.offset || 0, (options?.offset || 0) + options.limit)
    }

    return episodes
  }

  // DB fallback
  try {
    // Build conditions for the where clause
    const conditions = []

    if (options?.season) {
      conditions.push(eq(episodes.season, options.season))
    }

    if (options?.guestSlug) {
      conditions.push(eq(guests.slug, options.guestSlug))
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined

    let query = db!
      .select()
      .from(episodes)
      .leftJoin(guests, eq(episodes.guest_id, guests.id))
      .orderBy(desc(episodes.release_date))
      .$dynamic()

    if (whereClause) {
      query = query.where(whereClause)
    }

    if (options?.limit) {
      query = query.limit(options.limit)
    }

    if (options?.offset) {
      query = query.offset(options.offset)
    }

    const rows = await query

    const episodeList = rows.map(nestEpisodeWithGuest) as Episode[]

    // Fetch topics for each episode
    if (episodeList.length > 0) {
      const episodeIds = episodeList.map((e) => e.id)
      const topicRows = await db!
        .select({
          episode_id: episodeTopics.episode_id,
          id: topics.id,
          name: topics.name,
          slug: topics.slug,
          description: topics.description,
          created_at: topics.created_at,
        })
        .from(episodeTopics)
        .innerJoin(topics, eq(topics.id, episodeTopics.topic_id))
        .where(inArray(episodeTopics.episode_id, episodeIds))

      const topicsByEpisode: Record<string, Topic[]> = {}
      for (const row of topicRows) {
        const epId = row.episode_id
        if (!topicsByEpisode[epId]) topicsByEpisode[epId] = []
        topicsByEpisode[epId].push({
          id: row.id,
          name: row.name,
          slug: row.slug,
          description: row.description,
          created_at: row.created_at ? row.created_at.toISOString() : new Date().toISOString(),
        })
      }

      for (const ep of episodeList) {
        ep.topics = topicsByEpisode[ep.id] || []
      }
    }

    let results = filterHidden(episodeList)

    // Apply Arabic-aware search
    if (options?.search) {
      results = searchEpisodes(results, options.search)
    }

    return results
  } catch (error) {
    console.error('Error fetching episodes:', error)
    const { mockEpisodes } = await import('@/lib/mocks/episodes')
    return filterHidden(mockEpisodes)
  }
}

export async function getEpisodeBySlug(slug: string): Promise<EpisodeWithRelations | null> {
  // Check if episode is hidden or deleted
  const hiddenIds = await getHiddenEpisodeIds()

  // Try YouTube first if available
  if (USE_YOUTUBE) {
    try {
      let episode = await fetchEpisodeBySlug(slug)
      if (episode) {
        // Block access to deleted/hidden episodes
        if (hiddenIds.has(episode.id)) return null

        // Merge with DB data (DB wins per-field, YouTube keeps live stats)
        const dbEp = await fetchDbEpisodeById(episode.id)
        episode = mergeEpisode(episode, dbEp)

        // Apply title and description overrides
        const overrides = await getEpisodeOverrides()
        const [overridden] = applyOverrides([episode], overrides)
        episode = overridden

        // Apply admin guest assignments
        const [guestAssignments, guestList] = await Promise.all([
          getGuestAssignments(),
          getAllGuests(),
        ])
        const [withGuest] = applyGuestAssignments([episode], guestAssignments, guestList)
        episode = withGuest

        // Apply enrichments from Studio push
        const epId = episode.id
        const enrichment = await getEpisodeEnrichment(epId)

        const enrichedTimestamps: Timestamp[] = enrichment?.timestamps
          ? enrichment.timestamps.map((t, i) => ({
              id: `enr-ts-${i}`,
              episode_id: epId,
              time_seconds: t.time_seconds,
              title: t.title,
              description: t.description || null,
            }))
          : []

        const enrichedResources: Resource[] = enrichment?.resources
          ? enrichment.resources.map((r, i) => ({
              id: `enr-res-${i}`,
              episode_id: epId,
              title: r.title,
              url: r.url,
              type: r.type || null,
            }))
          : []

        const enrichedTopics: Topic[] = enrichment?.topics
          ? enrichment.topics.map((name) => ({
              id: `enr-topic-${name}`,
              name,
              slug: name.replace(/\s+/g, '-'),
              created_at: new Date().toISOString(),
            }))
          : []

        return {
          ...episode,
          summary: enrichment?.full_summary || episode.description || null,
          key_takeaways: enrichment?.takeaways || null,
          mood: null,
          guest_id: episode.guest?.id || null,
          guest: episode.guest || null,
          topics: enrichedTopics.length > 0
            ? [...(episode.topics || []), ...enrichedTopics]
            : episode.topics || [],
          timestamps: enrichedTimestamps,
          quotes: await getPublishedQuotes(episode.id, episode.guest?.id || null),
          resources: enrichedResources,
        }
      }
    } catch (error) {
      console.error('YouTube fetch failed, falling back:', error)
    }
  }

  if (USE_MOCK_DATA) {
    const { mockEpisodes } = await import('@/lib/mocks/episodes')
    const episode = mockEpisodes.find(e => e.slug === slug)
    if (!episode || hiddenIds.has(episode.id)) return null

    const configQuotes = await getPublishedQuotes(episode.id, episode.guest?.id || null)
    const mockEnrichment = await getEpisodeEnrichment(episode.id)
    return {
      ...episode,
      summary: mockEnrichment?.full_summary || episode.summary || null,
      key_takeaways: mockEnrichment?.takeaways || episode.key_takeaways || null,
      mood: episode.mood || null,
      guest_id: episode.guest_id || null,
      guest: episode.guest || null,
      topics: episode.topics || [],
      timestamps: mockTimestamps.filter(t => t.episode_id === episode.id),
      quotes: [...mockQuotes.filter(q => q.episode_id === episode.id), ...configQuotes],
      resources: mockResources.filter(r => r.episode_id === episode.id),
    }
  }

  // DB fallback
  try {
    const episodeRows = await db!
      .select()
      .from(episodes)
      .where(eq(episodes.slug, slug))

    const episodeRow = episodeRows[0]

    if (!episodeRow) {
      // Fallback to mock
      const { mockEpisodes } = await import('@/lib/mocks/episodes')
      const mockEp = mockEpisodes.find(e => e.slug === slug)
      if (mockEp && !hiddenIds.has(mockEp.id)) {
        return {
          ...mockEp,
          summary: mockEp.summary || null,
          key_takeaways: mockEp.key_takeaways || null,
          mood: mockEp.mood || null,
          guest_id: mockEp.guest_id || null,
          guest: mockEp.guest || null,
          topics: mockEp.topics || [],
          timestamps: mockTimestamps.filter(t => t.episode_id === mockEp.id),
          quotes: mockQuotes.filter(q => q.episode_id === mockEp.id),
          resources: mockResources.filter(r => r.episode_id === mockEp.id),
        }
      }
      return null
    }

    // Block access to deleted/hidden episodes
    if (hiddenIds.has(episodeRow.id)) return null

    // Fetch related data with separate queries
    const [guestRows, topicRows, timestampRows, quoteRows, resourceRows] = await Promise.all([
      episodeRow.guest_id
        ? db!.select().from(guests).where(eq(guests.id, episodeRow.guest_id))
        : Promise.resolve([]),
      db!
        .select({
          id: topics.id,
          name: topics.name,
          slug: topics.slug,
          description: topics.description,
          created_at: topics.created_at,
        })
        .from(topics)
        .innerJoin(episodeTopics, eq(topics.id, episodeTopics.topic_id))
        .where(eq(episodeTopics.episode_id, episodeRow.id)),
      db!
        .select()
        .from(timestampsTable)
        .where(eq(timestampsTable.episode_id, episodeRow.id))
        .orderBy(asc(timestampsTable.time_seconds)),
      db!
        .select()
        .from(quotesTable)
        .where(eq(quotesTable.episode_id, episodeRow.id)),
      db!
        .select()
        .from(resourcesTable)
        .where(eq(resourcesTable.episode_id, episodeRow.id)),
    ])

    const guestRow = guestRows[0] || null

    const episode: EpisodeWithRelations = {
      id: episodeRow.id,
      title: episodeRow.title,
      slug: episodeRow.slug,
      description: episodeRow.description || null,
      summary: episodeRow.summary || null,
      key_takeaways: episodeRow.key_takeaways || null,
      youtube_url: episodeRow.youtube_url,
      duration_minutes: episodeRow.duration_minutes,
      release_date: String(episodeRow.release_date),
      episode_number: episodeRow.episode_number || null,
      season: episodeRow.season || null,
      mood: episodeRow.mood || null,
      thumbnail_url: episodeRow.thumbnail_url || null,
      status: episodeRow.status || undefined,
      featured: episodeRow.featured || undefined,
      view_count: episodeRow.view_count || null,
      guest_id: episodeRow.guest_id || null,
      guest_testimonial: episodeRow.guest_testimonial || null,
      guest_video_url: episodeRow.guest_video_url || null,
      created_at: episodeRow.created_at ? episodeRow.created_at.toISOString() : new Date().toISOString(),
      updated_at: episodeRow.updated_at ? episodeRow.updated_at.toISOString() : undefined,
      guest: guestRow
        ? {
            id: guestRow.id,
            name: guestRow.name,
            slug: guestRow.slug,
            bio: guestRow.bio,
            photo_url: guestRow.photo_url,
            external_links: guestRow.external_links,
            testimonial: guestRow.testimonial,
            created_at: guestRow.created_at ? guestRow.created_at.toISOString() : new Date().toISOString(),
          }
        : null,
      topics: topicRows.map((t) => ({
        id: t.id,
        name: t.name,
        slug: t.slug,
        description: t.description,
        created_at: t.created_at ? t.created_at.toISOString() : new Date().toISOString(),
      })),
      timestamps: timestampRows.map((t) => ({
        id: t.id,
        episode_id: t.episode_id,
        time_seconds: t.time_seconds,
        title: t.title,
        description: t.description || null,
      })),
      quotes: quoteRows.map((q) => ({
        id: q.id,
        episode_id: q.episode_id,
        guest_id: q.guest_id || null,
        text: q.text,
        theme: q.theme || null,
        created_at: q.created_at ? q.created_at.toISOString() : new Date().toISOString(),
      })),
      resources: resourceRows.map((r) => ({
        id: r.id,
        episode_id: r.episode_id,
        title: r.title,
        url: r.url,
        type: r.type || null,
      })),
    }

    // Append config-file quotes
    const configQuotes = await getPublishedQuotes(episode.id, episode.guest_id || null)
    if (configQuotes.length > 0) {
      episode.quotes = [...episode.quotes, ...configQuotes]
    }

    return episode
  } catch (error) {
    console.error('Error fetching episode:', error)
    // Fallback to mock
    const { mockEpisodes } = await import('@/lib/mocks/episodes')
    const mockEp = mockEpisodes.find(e => e.slug === slug)
    if (mockEp && !hiddenIds.has(mockEp.id)) {
      return {
        ...mockEp,
        summary: mockEp.summary || null,
        key_takeaways: mockEp.key_takeaways || null,
        mood: mockEp.mood || null,
        guest_id: mockEp.guest_id || null,
        guest: mockEp.guest || null,
        topics: mockEp.topics || [],
        timestamps: mockTimestamps.filter(t => t.episode_id === mockEp.id),
        quotes: mockQuotes.filter(q => q.episode_id === mockEp.id),
        resources: mockResources.filter(r => r.episode_id === mockEp.id),
      }
    }
    return null
  }
}

export async function getLatestEpisode(): Promise<Episode | null> {
  const hiddenIds = await getHiddenEpisodeIds()
  const overrides = await getEpisodeOverrides()

  // Try YouTube first if available
  if (USE_YOUTUBE) {
    try {
      const episodes = await getCachedEpisodes()
      const visible = applyOverrides(
        episodes.filter((ep) => !hiddenIds.has(ep.id)),
        overrides
      )
      return visible[0] || null
    } catch (error) {
      console.error('YouTube fetch failed, falling back:', error)
    }
  }

  if (USE_MOCK_DATA) {
    const { mockEpisodes } = await import('@/lib/mocks/episodes')
    return mockEpisodes.find((ep) => !hiddenIds.has(ep.id)) || null
  }

  // DB fallback
  try {
    const rows = await db!
      .select()
      .from(episodes)
      .leftJoin(guests, eq(episodes.guest_id, guests.id))
      .orderBy(desc(episodes.release_date))
      .limit(20)

    if (!rows || rows.length === 0) {
      const { mockEpisodes } = await import('@/lib/mocks/episodes')
      return mockEpisodes.find((ep) => !hiddenIds.has(ep.id)) || null
    }

    const episodeList = rows.map(nestEpisodeWithGuest) as Episode[]
    return episodeList.find((ep) => !hiddenIds.has(ep.id)) || null
  } catch (error) {
    console.error('Error fetching latest episode:', error)
    const { mockEpisodes } = await import('@/lib/mocks/episodes')
    return mockEpisodes.find((ep) => !hiddenIds.has(ep.id)) || null
  }
}

export async function getMostViewedRecent(days: number = 30): Promise<Episode | null> {
  const hiddenIds = await getHiddenEpisodeIds()

  // Try YouTube first if available
  if (USE_YOUTUBE) {
    try {
      const episode = await fetchMostViewedRecent(days)
      if (episode && !hiddenIds.has(episode.id)) return episode
      // If the top one is hidden, fall back to fetching all and filtering
      const allEpisodes = await getCachedEpisodes()
      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - days)
      const visible = allEpisodes
        .filter((ep) => !hiddenIds.has(ep.id) && new Date(ep.release_date) >= cutoffDate)
        .sort((a, b) => (b.view_count || 0) - (a.view_count || 0))
      return visible[0] || null
    } catch (error) {
      console.error('YouTube fetch failed, falling back:', error)
    }
  }

  if (USE_MOCK_DATA) {
    const { mockEpisodes } = await import('@/lib/mocks/episodes')
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - days)

    const recentEpisodes = mockEpisodes.filter(
      (ep) => !hiddenIds.has(ep.id) && new Date(ep.release_date) >= cutoffDate
    )

    if (recentEpisodes.length === 0) {
      return mockEpisodes
        .filter((ep) => !hiddenIds.has(ep.id))
        .sort((a, b) => (b.view_count || 0) - (a.view_count || 0))[0] || null
    }

    return recentEpisodes.sort((a, b) => (b.view_count || 0) - (a.view_count || 0))[0] || null
  }

  // DB fallback
  try {
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - days)

    const rows = await db!
      .select()
      .from(episodes)
      .leftJoin(guests, eq(episodes.guest_id, guests.id))
      .where(gte(episodes.release_date, cutoffDate.toISOString().split('T')[0]))
      .orderBy(sql`${episodes.view_count} DESC NULLS LAST`)
      .limit(20)

    if (!rows || rows.length === 0) {
      const { mockEpisodes } = await import('@/lib/mocks/episodes')
      return mockEpisodes.find((ep) => !hiddenIds.has(ep.id)) || null
    }

    const episodeList = rows.map(nestEpisodeWithGuest) as Episode[]
    return episodeList.find((ep) => !hiddenIds.has(ep.id)) || null
  } catch (error) {
    console.error('Error fetching most viewed recent episode:', error)
    const { mockEpisodes } = await import('@/lib/mocks/episodes')
    return mockEpisodes.find((ep) => !hiddenIds.has(ep.id)) || null
  }
}

export async function getGuests(options?: {
  search?: string
  topicSlug?: string
}): Promise<Guest[]> {
  // Extract guests from YouTube episodes if available
  if (USE_YOUTUBE) {
    try {
      const episodes = await getCachedEpisodes()
      const guestMap = new Map<string, Guest>()

      for (const ep of episodes) {
        if (ep.guest) {
          guestMap.set(ep.guest.id, ep.guest)
        }
      }

      let guests = Array.from(guestMap.values())

      if (options?.search) {
        guests = searchGuests(guests, options.search)
      }

      return guests
    } catch (error) {
      console.error('YouTube fetch failed, falling back:', error)
    }
  }

  if (USE_MOCK_DATA) {
    let guestList = [...mockGuests]

    if (options?.search) {
      guestList = searchGuests(guestList, options.search)
    }

    return guestList
  }

  // DB fallback
  try {
    let query = db!
      .select()
      .from(guests)
      .orderBy(asc(guests.name))
      .$dynamic()

    if (options?.search) {
      // Escape SQL LIKE wildcards in user input
      const escapedSearch = options.search.replace(/[%_]/g, '\\$&')
      query = query.where(ilike(guests.name, `%${escapedSearch}%`))
    }

    const rows = await query

    return (rows || []).map((g) => ({
      id: g.id,
      name: g.name,
      slug: g.slug,
      bio: g.bio,
      photo_url: g.photo_url,
      external_links: g.external_links,
      testimonial: g.testimonial,
      created_at: g.created_at ? g.created_at.toISOString() : new Date().toISOString(),
    })) as Guest[]
  } catch (error) {
    console.error('Error fetching guests:', error)
    return mockGuests
  }
}

export async function getGuestBySlug(slug: string): Promise<GuestWithRelations | null> {
  // Try YouTube first if available
  if (USE_YOUTUBE) {
    try {
      const episodes = await getCachedEpisodes()
      let guest: Guest | null = null
      const guestEpisodes: Episode[] = []

      for (const ep of episodes) {
        if (ep.guest && ep.guest.slug === slug) {
          guest = ep.guest
          guestEpisodes.push(ep)
        }
      }

      if (guest) {
        return {
          ...guest,
          episodes: guestEpisodes,
          quotes: [],
        }
      }
    } catch (error) {
      console.error('YouTube fetch failed, falling back:', error)
    }
  }

  if (USE_MOCK_DATA) {
    const guest = mockGuests.find(g => g.slug === slug)
    if (!guest) return null

    const { mockEpisodes } = await import('@/lib/mocks/episodes')
    return {
      ...guest,
      episodes: mockEpisodes.filter(e => e.guest_id === guest.id),
      quotes: mockQuotes.filter(q => q.guest_id === guest.id),
    }
  }

  // DB fallback
  try {
    const guestRows = await db!
      .select()
      .from(guests)
      .where(eq(guests.slug, slug))

    const guestRow = guestRows[0]

    if (!guestRow) {
      // Fallback to mock
      const mockGuest = mockGuests.find(g => g.slug === slug)
      if (mockGuest) {
        const { mockEpisodes } = await import('@/lib/mocks/episodes')
        return {
          ...mockGuest,
          episodes: mockEpisodes.filter(e => e.guest_id === mockGuest.id),
          quotes: mockQuotes.filter(q => q.guest_id === mockGuest.id),
        }
      }
      return null
    }

    const [episodeRows, quoteRows] = await Promise.all([
      db!
        .select()
        .from(episodes)
        .where(eq(episodes.guest_id, guestRow.id))
        .orderBy(desc(episodes.release_date)),
      db!
        .select()
        .from(quotesTable)
        .where(eq(quotesTable.guest_id, guestRow.id)),
    ])

    return {
      id: guestRow.id,
      name: guestRow.name,
      slug: guestRow.slug,
      bio: guestRow.bio,
      photo_url: guestRow.photo_url,
      external_links: guestRow.external_links,
      testimonial: guestRow.testimonial,
      created_at: guestRow.created_at ? guestRow.created_at.toISOString() : new Date().toISOString(),
      episodes: episodeRows.map((e) => ({
        id: e.id,
        title: e.title,
        slug: e.slug,
        description: e.description || null,
        summary: e.summary || null,
        key_takeaways: e.key_takeaways || null,
        youtube_url: e.youtube_url,
        duration_minutes: e.duration_minutes,
        release_date: String(e.release_date),
        episode_number: e.episode_number || null,
        season: e.season || null,
        mood: e.mood || null,
        thumbnail_url: e.thumbnail_url || null,
        status: e.status || undefined,
        featured: e.featured || undefined,
        view_count: e.view_count || null,
        guest_id: e.guest_id || null,
        guest_testimonial: e.guest_testimonial || null,
        guest_video_url: e.guest_video_url || null,
        created_at: e.created_at ? e.created_at.toISOString() : new Date().toISOString(),
        updated_at: e.updated_at ? e.updated_at.toISOString() : undefined,
      })) as Episode[],
      quotes: quoteRows.map((q) => ({
        id: q.id,
        episode_id: q.episode_id,
        guest_id: q.guest_id || null,
        text: q.text,
        theme: q.theme || null,
        created_at: q.created_at ? q.created_at.toISOString() : new Date().toISOString(),
      })) as Quote[],
    } as GuestWithRelations
  } catch (error) {
    console.error('Error fetching guest:', error)
    // Fallback to mock
    const mockGuest = mockGuests.find(g => g.slug === slug)
    if (mockGuest) {
      const { mockEpisodes } = await import('@/lib/mocks/episodes')
      return {
        ...mockGuest,
        episodes: mockEpisodes.filter(e => e.guest_id === mockGuest.id),
        quotes: mockQuotes.filter(q => q.guest_id === mockGuest.id),
      }
    }
    return null
  }
}

export async function getTopics(): Promise<Topic[]> {
  // Extract topics from YouTube episodes if available
  if (USE_YOUTUBE) {
    try {
      const episodes = await getCachedEpisodes()
      const topicMap = new Map<string, Topic>()

      for (const ep of episodes) {
        for (const topic of ep.topics || []) {
          if (!topicMap.has(topic.name)) {
            topicMap.set(topic.name, topic)
          }
        }
      }

      return Array.from(topicMap.values()).sort((a, b) => a.name.localeCompare(b.name))
    } catch (error) {
      console.error('YouTube fetch failed, falling back:', error)
    }
  }

  if (USE_MOCK_DATA) {
    return mockTopics
  }

  // DB fallback
  try {
    const rows = await db!
      .select()
      .from(topics)
      .orderBy(asc(topics.name))

    return (rows || []).map((t) => ({
      id: t.id,
      name: t.name,
      slug: t.slug,
      description: t.description,
      created_at: t.created_at ? t.created_at.toISOString() : new Date().toISOString(),
    })) as Topic[]
  } catch (error) {
    console.error('Error fetching topics:', error)
    return mockTopics
  }
}

export async function getAdjacentEpisodes(
  currentSlug: string
): Promise<{ prev: Episode | null; next: Episode | null }> {
  // Get all visible episodes sorted by date (newest first)
  const episodes = await getEpisodes({})

  const currentIndex = episodes.findIndex((e) => e.slug === currentSlug)
  if (currentIndex === -1) return { prev: null, next: null }

  // "next" = newer episode (index - 1), "prev" = older episode (index + 1)
  const next = currentIndex > 0 ? episodes[currentIndex - 1] : null
  const prev = currentIndex < episodes.length - 1 ? episodes[currentIndex + 1] : null

  return { prev, next }
}

export async function getRelatedEpisodes(
  episodeId: string,
  topicIds: string[],
  limit: number = 3
): Promise<Episode[]> {
  if (topicIds.length === 0) return []

  if (USE_YOUTUBE) {
    try {
      const episodes = await getCachedEpisodes()
      return episodes
        .filter(e => e.id !== episodeId)
        .slice(0, limit)
    } catch (error) {
      console.error('YouTube fetch failed, falling back:', error)
    }
  }

  if (USE_MOCK_DATA) {
    const { mockEpisodes } = await import('@/lib/mocks/episodes')
    return mockEpisodes
      .filter(e => e.id !== episodeId)
      .slice(0, limit)
  }

  // DB fallback
  try {
    const rows = await db!
      .selectDistinctOn([episodes.id])
      .from(episodes)
      .leftJoin(guests, eq(episodes.guest_id, guests.id))
      .innerJoin(episodeTopics, eq(episodes.id, episodeTopics.episode_id))
      .where(
        and(
          inArray(episodeTopics.topic_id, topicIds),
          ne(episodes.id, episodeId)
        )
      )
      .limit(limit)

    return (rows || []).map(nestEpisodeWithGuest) as Episode[]
  } catch (error) {
    console.error('Error fetching related episodes:', error)
    const { mockEpisodes } = await import('@/lib/mocks/episodes')
    return mockEpisodes.filter(e => e.id !== episodeId).slice(0, limit)
  }
}

export async function getEpisodesByTopicPath(topicSlugs: string[]): Promise<Episode[]> {
  if (USE_YOUTUBE) {
    try {
      const episodes = await getCachedEpisodes()
      return episodes
        .filter(e => e.topics?.some(t => topicSlugs.includes(t.slug)))
        .slice(0, 5)
    } catch (error) {
      console.error('YouTube fetch failed, falling back:', error)
    }
  }

  if (USE_MOCK_DATA) {
    const { mockEpisodes } = await import('@/lib/mocks/episodes')
    return mockEpisodes.filter(e =>
      e.topics?.some(t => topicSlugs.includes(t.slug))
    ).slice(0, 5)
  }

  // DB fallback
  try {
    const topicRows = await db!
      .select({ id: topics.id })
      .from(topics)
      .where(inArray(topics.slug, topicSlugs))

    if (!topicRows || topicRows.length === 0) {
      const { mockEpisodes } = await import('@/lib/mocks/episodes')
      return mockEpisodes.slice(0, 5)
    }

    const topicIds = topicRows.map((t) => t.id)

    const rows = await db!
      .selectDistinctOn([episodes.id])
      .from(episodes)
      .leftJoin(guests, eq(episodes.guest_id, guests.id))
      .innerJoin(episodeTopics, eq(episodes.id, episodeTopics.episode_id))
      .where(inArray(episodeTopics.topic_id, topicIds))
      .orderBy(desc(episodes.release_date))
      .limit(5)

    return (rows || []).map(nestEpisodeWithGuest) as Episode[]
  } catch (error) {
    console.error('Error fetching episodes by topic path:', error)
    const { mockEpisodes } = await import('@/lib/mocks/episodes')
    return mockEpisodes.slice(0, 5)
  }
}

export async function getEpisodeCounts(): Promise<Record<string, number>> {
  let episodes: Episode[] = []

  if (USE_YOUTUBE) {
    try {
      episodes = await getCachedEpisodes()
    } catch (error) {
      console.error('YouTube fetch failed:', error)
    }
  }

  if (episodes.length === 0 && USE_MOCK_DATA) {
    const { mockEpisodes } = await import('@/lib/mocks/episodes')
    episodes = mockEpisodes
  }

  // Filter out hidden episodes and get section assignments
  const [hiddenIds, sectionsConfig] = await Promise.all([
    getHiddenEpisodeIds(),
    getSectionsConfig(),
  ])
  if (hiddenIds.size > 0) {
    episodes = episodes.filter((e) => !hiddenIds.has(e.id))
  }

  const { sections, assignments } = sectionsConfig
  const counts: Record<string, number> = { all: episodes.length }

  // Count per visible section using the same filter logic
  for (const section of sections) {
    if (!section.hidden) {
      counts[section.id] = filterByCategory(episodes, section.id, assignments).length
    }
  }

  return counts
}

export async function getPublicSections(): Promise<{ id: string; label: string }[]> {
  const config = await getSectionsConfig()
  return config.sections
    .filter((s) => !s.hidden)
    .sort((a, b) => a.order - b.order)
    .map((s) => ({ id: s.id, label: s.label }))
}

export async function subscribeNewsletter(email: string): Promise<{ success: boolean; error?: string }> {
  if (USE_MOCK_DATA) {
    return { success: true }
  }

  try {
    await db!
      .insert(newsletterSubscribers)
      .values({ email })

    return { success: true }
  } catch (error: unknown) {
    const pgError = error as { code?: string }
    if (pgError.code === '23505') {
      return { success: false, error: 'البريد الإلكتروني مسجل بالفعل' }
    }
    return { success: false, error: 'حدث خطأ. يرجى المحاولة مرة أخرى.' }
  }
}

export async function submitSponsorshipLead(data: {
  name: string
  email: string
  company?: string
  message?: string
}): Promise<{ success: boolean; error?: string }> {
  if (USE_MOCK_DATA) {
    return { success: true }
  }

  try {
    await db!
      .insert(sponsorshipLeads)
      .values(data as unknown as typeof sponsorshipLeads.$inferInsert)

    return { success: true }
  } catch {
    return { success: false, error: 'حدث خطأ. يرجى المحاولة مرة أخرى.' }
  }
}

export async function submitGuestApplication(data: {
  name: string
  email: string
  topic?: string
  links?: string
  bio?: string
}): Promise<{ success: boolean; error?: string }> {
  if (USE_MOCK_DATA) {
    return { success: true }
  }

  try {
    await db!
      .insert(guestApplications)
      .values(data as unknown as typeof guestApplications.$inferInsert)

    return { success: true }
  } catch {
    return { success: false, error: 'حدث خطأ. يرجى المحاولة مرة أخرى.' }
  }
}
