import { createClient } from './server'
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

const USE_MOCK_DATA = process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('placeholder') || !process.env.NEXT_PUBLIC_SUPABASE_URL
const USE_YOUTUBE = !!process.env.YOUTUBE_API_KEY
const USE_DB = !USE_MOCK_DATA

async function fetchDbEpisodes(): Promise<Partial<Episode>[]> {
  if (!USE_DB) return []
  try {
    const supabase = await createClient()
    const { data } = await supabase
      .from('episodes')
      .select('*, guest:guests(id, name, slug, photo_url)')
      .order('release_date', { ascending: false })
    return (data || []) as Partial<Episode>[]
  } catch {
    return []
  }
}

async function fetchDbEpisodeById(id: string): Promise<Partial<Episode> | null> {
  if (!USE_DB) return null
  try {
    const supabase = await createClient()
    const { data } = await supabase
      .from('episodes')
      .select('*, guest:guests(id, name, slug, photo_url)')
      .eq('id', id)
      .maybeSingle()
    return (data as Partial<Episode>) || null
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

  const supabase = await createClient()

  let query = supabase
    .from('episodes')
    .select(`
      *,
      guest:guests(id, name, slug, photo_url),
      topics:episode_topics(topic:topics(*))
    `)
    .order('release_date', { ascending: false })

  if (options?.season) {
    query = query.eq('season', options.season)
  }

  if (options?.guestSlug) {
    query = query.eq('guest.slug', options.guestSlug)
  }

  if (options?.limit) {
    query = query.limit(options.limit)
  }

  if (options?.offset) {
    query = query.range(options.offset, options.offset + (options.limit || 10) - 1)
  }

  const { data, error } = await query

  if (error) {
    console.error('Error fetching episodes:', error)
    const { mockEpisodes } = await import('@/lib/mocks/episodes')
    return filterHidden(mockEpisodes)
  }

  let results = filterHidden(data || [])

  // Apply Arabic-aware search
  if (options?.search) {
    results = searchEpisodes(results, options.search)
  }

  return results
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

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('episodes')
    .select(`
      *,
      guest:guests(*),
      topics:episode_topics(topic:topics(*)),
      timestamps(*),
      quotes(*),
      resources(*)
    `)
    .eq('slug', slug)
    .single()

  if (error || !data) {
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

  // Block access to deleted/hidden episodes
  if (hiddenIds.has((data as { id: string }).id)) return null

  // Transform the nested topics
  const rawData = data as Record<string, unknown>
  const episode: EpisodeWithRelations = {
    id: rawData.id as string,
    title: rawData.title as string,
    slug: rawData.slug as string,
    summary: rawData.summary as string | null,
    key_takeaways: rawData.key_takeaways as string[] | null,
    youtube_url: rawData.youtube_url as string,
    duration_minutes: rawData.duration_minutes as number,
    release_date: rawData.release_date as string,
    season: rawData.season as number | null,
    mood: rawData.mood as string | null,
    guest_id: rawData.guest_id as string | null,
    created_at: rawData.created_at as string,
    guest: rawData.guest as Guest | null,
    topics: ((rawData.topics as { topic: Topic }[] | null) || []).map(t => t.topic),
    timestamps: (rawData.timestamps as Timestamp[]) || [],
    quotes: (rawData.quotes as Quote[]) || [],
    resources: (rawData.resources as Resource[]) || [],
  }

  // Append config-file quotes
  const configQuotes = await getPublishedQuotes(episode.id, episode.guest_id || null)
  if (configQuotes.length > 0) {
    episode.quotes = [...episode.quotes, ...configQuotes]
  }

  return episode
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

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('episodes')
    .select(`
      *,
      guest:guests(id, name, slug, photo_url)
    `)
    .order('release_date', { ascending: false })
    .limit(20)

  if (error || !data) {
    console.error('Error fetching latest episode:', error)
    const { mockEpisodes } = await import('@/lib/mocks/episodes')
    return mockEpisodes.find((ep) => !hiddenIds.has(ep.id)) || null
  }

  return data.find((ep) => !hiddenIds.has(ep.id)) || null
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

  const supabase = await createClient()
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - days)

  const { data, error } = await supabase
    .from('episodes')
    .select(`
      *,
      guest:guests(id, name, slug, photo_url)
    `)
    .gte('release_date', cutoffDate.toISOString().split('T')[0])
    .order('view_count', { ascending: false, nullsFirst: false })
    .limit(20)

  if (error || !data) {
    console.error('Error fetching most viewed recent episode:', error)
    const { mockEpisodes } = await import('@/lib/mocks/episodes')
    return mockEpisodes.find((ep) => !hiddenIds.has(ep.id)) || null
  }

  return data.find((ep) => !hiddenIds.has(ep.id)) || null
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

  const supabase = await createClient()

  let query = supabase
    .from('guests')
    .select('*')
    .order('name')

  if (options?.search) {
    // Escape SQL LIKE wildcards in user input
    const escapedSearch = options.search.replace(/[%_]/g, '\\$&')
    query = query.ilike('name', `%${escapedSearch}%`)
  }

  const { data, error } = await query

  if (error) {
    console.error('Error fetching guests:', error)
    return mockGuests
  }

  return data || []
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

  const supabase = await createClient()

  const { data: guest, error: guestError } = await supabase
    .from('guests')
    .select('*')
    .eq('slug', slug)
    .single()

  if (guestError || !guest) {
    console.error('Error fetching guest:', guestError)
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

  const { data: episodes } = await supabase
    .from('episodes')
    .select('*')
    .eq('guest_id', guest.id)
    .order('release_date', { ascending: false })

  const { data: quotes } = await supabase
    .from('quotes')
    .select('*')
    .eq('guest_id', guest.id)

  return {
    ...guest,
    episodes: episodes || [],
    quotes: quotes || [],
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

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('topics')
    .select('*')
    .order('name')

  if (error) {
    console.error('Error fetching topics:', error)
    return mockTopics
  }

  return data || []
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

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('episodes')
    .select(`
      *,
      guest:guests(id, name, slug, photo_url),
      topics:episode_topics!inner(topic_id)
    `)
    .in('topics.topic_id', topicIds)
    .neq('id', episodeId)
    .limit(limit)

  if (error) {
    console.error('Error fetching related episodes:', error)
    const { mockEpisodes } = await import('@/lib/mocks/episodes')
    return mockEpisodes.filter(e => e.id !== episodeId).slice(0, limit)
  }

  return data || []
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

  const supabase = await createClient()

  const { data: topics } = await supabase
    .from('topics')
    .select('id')
    .in('slug', topicSlugs)

  if (!topics || topics.length === 0) {
    const { mockEpisodes } = await import('@/lib/mocks/episodes')
    return mockEpisodes.slice(0, 5)
  }

  const topicIds = topics.map(t => t.id)

  const { data, error } = await supabase
    .from('episodes')
    .select(`
      *,
      guest:guests(id, name, slug, photo_url),
      topics:episode_topics!inner(topic_id)
    `)
    .in('topics.topic_id', topicIds)
    .order('release_date', { ascending: false })
    .limit(5)

  if (error) {
    console.error('Error fetching episodes by topic path:', error)
    const { mockEpisodes } = await import('@/lib/mocks/episodes')
    return mockEpisodes.slice(0, 5)
  }

  return data || []
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

  const supabase = await createClient()

  const { error } = await supabase
    .from('newsletter_subscribers')
    .insert({ email })

  if (error) {
    if (error.code === '23505') {
      return { success: false, error: 'البريد الإلكتروني مسجل بالفعل' }
    }
    return { success: false, error: 'حدث خطأ. يرجى المحاولة مرة أخرى.' }
  }

  return { success: true }
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

  const supabase = await createClient()

  const { error } = await supabase
    .from('sponsorship_leads')
    .insert(data)

  if (error) {
    return { success: false, error: 'حدث خطأ. يرجى المحاولة مرة أخرى.' }
  }

  return { success: true }
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

  const supabase = await createClient()

  const { error } = await supabase
    .from('guest_applications')
    .insert(data)

  if (error) {
    return { success: false, error: 'حدث خطأ. يرجى المحاولة مرة أخرى.' }
  }

  return { success: true }
}
