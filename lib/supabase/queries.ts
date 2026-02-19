import { pool, USE_DB as DB_AVAILABLE } from "@/lib/db"
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

async function fetchDbEpisodes(): Promise<Partial<Episode>[]> {
  if (!USE_DB) return []
  try {
    const { rows } = await pool!.query(
      `SELECT e.*, row_to_json(g.*) as guest
       FROM episodes e
       LEFT JOIN guests g ON e.guest_id = g.id
       ORDER BY e.release_date DESC`
    )
    return (rows || []) as Partial<Episode>[]
  } catch {
    return []
  }
}

async function fetchDbEpisodeById(id: string): Promise<Partial<Episode> | null> {
  if (!USE_DB) return null
  try {
    const { rows } = await pool!.query(
      `SELECT e.*, row_to_json(g.*) as guest
       FROM episodes e
       LEFT JOIN guests g ON e.guest_id = g.id
       WHERE e.id = $1`,
      [id]
    )
    return (rows[0] as Partial<Episode>) || null
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
    const conditions: string[] = []
    const params: unknown[] = []
    let paramIndex = 1

    if (options?.season) {
      conditions.push(`e.season = $${paramIndex++}`)
      params.push(options.season)
    }

    if (options?.guestSlug) {
      conditions.push(`g.slug = $${paramIndex++}`)
      params.push(options.guestSlug)
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    const limitClause = options?.limit ? `LIMIT $${paramIndex++}` : ''
    if (options?.limit) params.push(options.limit)

    const offsetClause = options?.offset ? `OFFSET $${paramIndex++}` : ''
    if (options?.offset) params.push(options.offset)

    const { rows: episodes } = await pool!.query(
      `SELECT e.*, row_to_json(g.*) as guest
       FROM episodes e
       LEFT JOIN guests g ON e.guest_id = g.id
       ${whereClause}
       ORDER BY e.release_date DESC
       ${limitClause} ${offsetClause}`,
      params
    )

    // Fetch topics for each episode
    if (episodes.length > 0) {
      const episodeIds = episodes.map((e: Record<string, unknown>) => e.id)
      const { rows: topicRows } = await pool!.query(
        `SELECT et.episode_id, t.*
         FROM episode_topics et
         JOIN topics t ON t.id = et.topic_id
         WHERE et.episode_id = ANY($1)`,
        [episodeIds]
      )

      const topicsByEpisode: Record<string, Topic[]> = {}
      for (const row of topicRows) {
        const epId = row.episode_id
        if (!topicsByEpisode[epId]) topicsByEpisode[epId] = []
        topicsByEpisode[epId].push({
          id: row.id,
          name: row.name,
          slug: row.slug,
          description: row.description,
          created_at: row.created_at,
        })
      }

      for (const ep of episodes) {
        ep.topics = topicsByEpisode[ep.id as string] || []
      }
    }

    let results = filterHidden(episodes as Episode[])

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
    const { rows: [episodeRow] } = await pool!.query(
      'SELECT * FROM episodes WHERE slug = $1',
      [slug]
    )

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
    const [guestResult, topicsResult, timestampsResult, quotesResult, resourcesResult] = await Promise.all([
      episodeRow.guest_id
        ? pool!.query('SELECT * FROM guests WHERE id = $1', [episodeRow.guest_id])
        : Promise.resolve({ rows: [] }),
      pool!.query(
        `SELECT t.* FROM topics t
         JOIN episode_topics et ON t.id = et.topic_id
         WHERE et.episode_id = $1`,
        [episodeRow.id]
      ),
      pool!.query(
        'SELECT * FROM timestamps WHERE episode_id = $1 ORDER BY time_seconds ASC',
        [episodeRow.id]
      ),
      pool!.query(
        'SELECT * FROM quotes WHERE episode_id = $1',
        [episodeRow.id]
      ),
      pool!.query(
        'SELECT * FROM resources WHERE episode_id = $1',
        [episodeRow.id]
      ),
    ])

    const episode: EpisodeWithRelations = {
      id: episodeRow.id,
      title: episodeRow.title,
      slug: episodeRow.slug,
      summary: episodeRow.summary || null,
      key_takeaways: episodeRow.key_takeaways || null,
      youtube_url: episodeRow.youtube_url,
      duration_minutes: episodeRow.duration_minutes,
      release_date: episodeRow.release_date,
      season: episodeRow.season || null,
      mood: episodeRow.mood || null,
      guest_id: episodeRow.guest_id || null,
      created_at: episodeRow.created_at,
      guest: (guestResult.rows[0] as Guest) || null,
      topics: (topicsResult.rows as Topic[]) || [],
      timestamps: (timestampsResult.rows as Timestamp[]) || [],
      quotes: (quotesResult.rows as Quote[]) || [],
      resources: (resourcesResult.rows as Resource[]) || [],
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
    const { rows } = await pool!.query(
      `SELECT e.*, row_to_json(g.*) as guest
       FROM episodes e
       LEFT JOIN guests g ON e.guest_id = g.id
       ORDER BY e.release_date DESC
       LIMIT 20`
    )

    if (!rows || rows.length === 0) {
      const { mockEpisodes } = await import('@/lib/mocks/episodes')
      return mockEpisodes.find((ep) => !hiddenIds.has(ep.id)) || null
    }

    return (rows as Episode[]).find((ep) => !hiddenIds.has(ep.id)) || null
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

    const { rows } = await pool!.query(
      `SELECT e.*, row_to_json(g.*) as guest
       FROM episodes e
       LEFT JOIN guests g ON e.guest_id = g.id
       WHERE e.release_date >= $1
       ORDER BY e.view_count DESC NULLS LAST
       LIMIT 20`,
      [cutoffDate.toISOString().split('T')[0]]
    )

    if (!rows || rows.length === 0) {
      const { mockEpisodes } = await import('@/lib/mocks/episodes')
      return mockEpisodes.find((ep) => !hiddenIds.has(ep.id)) || null
    }

    return (rows as Episode[]).find((ep) => !hiddenIds.has(ep.id)) || null
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
    let guests = [...mockGuests]

    if (options?.search) {
      guests = searchGuests(guests, options.search)
    }

    return guests
  }

  // DB fallback
  try {
    let query = 'SELECT * FROM guests'
    const params: unknown[] = []

    if (options?.search) {
      // Escape SQL LIKE wildcards in user input
      const escapedSearch = options.search.replace(/[%_]/g, '\\$&')
      query += ' WHERE name ILIKE $1'
      params.push(`%${escapedSearch}%`)
    }

    query += ' ORDER BY name'

    const { rows } = await pool!.query(query, params)

    return (rows as Guest[]) || []
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
    const { rows: [guest] } = await pool!.query(
      'SELECT * FROM guests WHERE slug = $1',
      [slug]
    )

    if (!guest) {
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

    const [episodesResult, quotesResult] = await Promise.all([
      pool!.query(
        'SELECT * FROM episodes WHERE guest_id = $1 ORDER BY release_date DESC',
        [guest.id]
      ),
      pool!.query(
        'SELECT * FROM quotes WHERE guest_id = $1',
        [guest.id]
      ),
    ])

    return {
      ...guest,
      episodes: episodesResult.rows || [],
      quotes: quotesResult.rows || [],
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
    const { rows } = await pool!.query('SELECT * FROM topics ORDER BY name')

    return (rows as Topic[]) || []
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
    const { rows } = await pool!.query(
      `SELECT DISTINCT e.*, row_to_json(g.*) as guest
       FROM episodes e
       LEFT JOIN guests g ON e.guest_id = g.id
       JOIN episode_topics et ON e.id = et.episode_id
       WHERE et.topic_id = ANY($1) AND e.id != $2
       LIMIT $3`,
      [topicIds, episodeId, limit]
    )

    return (rows as Episode[]) || []
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
    const { rows: topics } = await pool!.query(
      'SELECT id FROM topics WHERE slug = ANY($1)',
      [topicSlugs]
    )

    if (!topics || topics.length === 0) {
      const { mockEpisodes } = await import('@/lib/mocks/episodes')
      return mockEpisodes.slice(0, 5)
    }

    const topicIds = topics.map((t: { id: string }) => t.id)

    const { rows } = await pool!.query(
      `SELECT DISTINCT e.*, row_to_json(g.*) as guest
       FROM episodes e
       LEFT JOIN guests g ON e.guest_id = g.id
       JOIN episode_topics et ON e.id = et.episode_id
       WHERE et.topic_id = ANY($1)
       ORDER BY e.release_date DESC
       LIMIT 5`,
      [topicIds]
    )

    return (rows as Episode[]) || []
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
    await pool!.query(
      'INSERT INTO newsletter_subscribers (email) VALUES ($1)',
      [email]
    )
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
    const columns = Object.keys(data)
    const values = Object.values(data)
    const placeholders = columns.map((_, i) => `$${i + 1}`)

    await pool!.query(
      `INSERT INTO sponsorship_leads (${columns.join(', ')}) VALUES (${placeholders.join(', ')})`,
      values
    )
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
    const columns = Object.keys(data)
    const values = Object.values(data)
    const placeholders = columns.map((_, i) => `$${i + 1}`)

    await pool!.query(
      `INSERT INTO guest_applications (${columns.join(', ')}) VALUES (${placeholders.join(', ')})`,
      values
    )
    return { success: true }
  } catch {
    return { success: false, error: 'حدث خطأ. يرجى المحاولة مرة أخرى.' }
  }
}
