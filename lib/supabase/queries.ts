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
} from '@/lib/mock-data'
import {
  fetchAllEpisodes,
  fetchEpisodeBySlug,
  fetchLatestEpisode,
  fetchMostViewedRecent,
  fetchEpisodes as fetchYouTubeEpisodes,
} from '@/lib/youtube/queries'
import { getEpisodeOverrides, applyOverrides } from '@/lib/episode-overrides'
import { getHiddenEpisodeIds } from '@/lib/episode-sections'

const USE_MOCK_DATA = process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('placeholder') || !process.env.NEXT_PUBLIC_SUPABASE_URL
const USE_YOUTUBE = !!process.env.YOUTUBE_API_KEY

// Filter episodes by category based on title keywords
function filterByCategory(episodes: Episode[], category: string): Episode[] {
  switch (category) {
    case 'season-1':
      // Season 1 episodes - filter by title containing season indicator or by episode number
      return episodes.filter(e =>
        e.title.includes('الموسم الأول') ||
        e.title.includes('موسم 1') ||
        e.season === 1 ||
        (e.episode_number && e.episode_number <= 30)
      )
    case 'season-2':
      // Season 2 episodes
      return episodes.filter(e =>
        e.title.includes('الموسم الثاني') ||
        e.title.includes('موسم 2') ||
        e.season === 2 ||
        (e.episode_number && e.episode_number > 30)
      )
    case 'clips':
      // Clips - short content, usually has "مقاطع" or "مقطع" in title
      return episodes.filter(e =>
        e.title.includes('مقاطع') ||
        e.title.includes('مقطع') ||
        e.title.includes('clips') ||
        e.duration_minutes < 15
      )
    case 'unreleased':
      // Unreleased content - might have specific keywords
      return episodes.filter(e =>
        e.title.includes('غير منشور') ||
        e.title.includes('حصري') ||
        e.title.includes('خاص')
      )
    default:
      return episodes
  }
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
  // Get episode overrides and hidden IDs
  const [overrides, hiddenIds] = await Promise.all([
    getEpisodeOverrides(),
    options?.includeHidden ? Promise.resolve(new Set<string>()) : getHiddenEpisodeIds(),
  ])

  const filterHidden = (eps: Episode[]) =>
    hiddenIds.size > 0 ? eps.filter((e) => !hiddenIds.has(e.id)) : eps

  // Try YouTube first if available
  if (USE_YOUTUBE) {
    try {
      let episodes = await fetchYouTubeEpisodes({
        limit: options?.limit,
        offset: options?.offset,
        search: options?.search,
      })

      // Apply title overrides
      episodes = applyOverrides(episodes, overrides)

      // Filter by category
      if (options?.category) {
        episodes = filterByCategory(episodes, options.category)
      }

      return filterHidden(episodes)
    } catch (error) {
      console.error('YouTube fetch failed, falling back:', error)
    }
  }

  if (USE_MOCK_DATA) {
    const { mockEpisodes } = await import('@/lib/mock-data')
    let episodes = [...mockEpisodes]

    if (options?.search) {
      const search = options.search.toLowerCase()
      episodes = episodes.filter(e =>
        e.title.toLowerCase().includes(search) ||
        e.summary?.toLowerCase().includes(search)
      )
    }

    // Filter by category
    if (options?.category) {
      episodes = filterByCategory(episodes, options.category)
    }

    if (options?.season) {
      episodes = episodes.filter(e => e.season === options.season)
    }

    if (options?.guestSlug) {
      episodes = episodes.filter(e => e.guest?.slug === options.guestSlug)
    }

    if (options?.limit) {
      episodes = episodes.slice(options?.offset || 0, (options?.offset || 0) + options.limit)
    }

    return filterHidden(episodes)
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

  if (options?.search) {
    query = query.or(`title.ilike.%${options.search}%,summary.ilike.%${options.search}%`)
  }

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
    const { mockEpisodes } = await import('@/lib/mock-data')
    return filterHidden(mockEpisodes)
  }

  return filterHidden(data || [])
}

export async function getEpisodeBySlug(slug: string): Promise<EpisodeWithRelations | null> {
  // Try YouTube first if available
  if (USE_YOUTUBE) {
    try {
      const episode = await fetchEpisodeBySlug(slug)
      if (episode) {
        return {
          ...episode,
          summary: episode.description || null,
          key_takeaways: null,
          mood: null,
          guest_id: episode.guest?.id || null,
          guest: episode.guest || null,
          topics: episode.topics || [],
          timestamps: [],
          quotes: [],
          resources: [],
        }
      }
    } catch (error) {
      console.error('YouTube fetch failed, falling back:', error)
    }
  }

  if (USE_MOCK_DATA) {
    const { mockEpisodes } = await import('@/lib/mock-data')
    const episode = mockEpisodes.find(e => e.slug === slug)
    if (!episode) return null

    return {
      ...episode,
      summary: episode.summary || null,
      key_takeaways: episode.key_takeaways || null,
      mood: episode.mood || null,
      guest_id: episode.guest_id || null,
      guest: episode.guest || null,
      topics: episode.topics || [],
      timestamps: mockTimestamps.filter(t => t.episode_id === episode.id),
      quotes: mockQuotes.filter(q => q.episode_id === episode.id),
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
    const { mockEpisodes } = await import('@/lib/mock-data')
    const mockEp = mockEpisodes.find(e => e.slug === slug)
    if (mockEp) {
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

  return episode
}

export async function getLatestEpisode(): Promise<Episode | null> {
  // Try YouTube first if available
  if (USE_YOUTUBE) {
    try {
      return await fetchLatestEpisode()
    } catch (error) {
      console.error('YouTube fetch failed, falling back:', error)
    }
  }

  if (USE_MOCK_DATA) {
    const { mockEpisodes } = await import('@/lib/mock-data')
    return mockEpisodes[0] || null
  }

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('episodes')
    .select(`
      *,
      guest:guests(id, name, slug, photo_url)
    `)
    .order('release_date', { ascending: false })
    .limit(1)
    .single()

  if (error) {
    console.error('Error fetching latest episode:', error)
    const { mockEpisodes } = await import('@/lib/mock-data')
    return mockEpisodes[0] || null
  }

  return data
}

export async function getMostViewedRecent(days: number = 30): Promise<Episode | null> {
  // Try YouTube first if available
  if (USE_YOUTUBE) {
    try {
      return await fetchMostViewedRecent(days)
    } catch (error) {
      console.error('YouTube fetch failed, falling back:', error)
    }
  }

  if (USE_MOCK_DATA) {
    const { mockEpisodes } = await import('@/lib/mock-data')
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - days)

    const recentEpisodes = mockEpisodes.filter(
      (ep) => new Date(ep.release_date) >= cutoffDate
    )

    if (recentEpisodes.length === 0) {
      return mockEpisodes.sort((a, b) => (b.view_count || 0) - (a.view_count || 0))[0] || null
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
    .limit(1)
    .single()

  if (error) {
    console.error('Error fetching most viewed recent episode:', error)
    const { mockEpisodes } = await import('@/lib/mock-data')
    return mockEpisodes[0] || null
  }

  return data
}

export async function getGuests(options?: {
  search?: string
  topicSlug?: string
}): Promise<Guest[]> {
  // Extract guests from YouTube episodes if available
  if (USE_YOUTUBE) {
    try {
      const episodes = await fetchAllEpisodes()
      const guestMap = new Map<string, Guest>()

      for (const ep of episodes) {
        if (ep.guest) {
          guestMap.set(ep.guest.id, ep.guest)
        }
      }

      let guests = Array.from(guestMap.values())

      if (options?.search) {
        const search = options.search.toLowerCase()
        guests = guests.filter(g => g.name.toLowerCase().includes(search))
      }

      return guests
    } catch (error) {
      console.error('YouTube fetch failed, falling back:', error)
    }
  }

  if (USE_MOCK_DATA) {
    let guests = [...mockGuests]

    if (options?.search) {
      const search = options.search.toLowerCase()
      guests = guests.filter(g => g.name.toLowerCase().includes(search))
    }

    return guests
  }

  const supabase = await createClient()

  let query = supabase
    .from('guests')
    .select('*')
    .order('name')

  if (options?.search) {
    query = query.ilike('name', `%${options.search}%`)
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
      const episodes = await fetchAllEpisodes()
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

    const { mockEpisodes } = await import('@/lib/mock-data')
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
      const { mockEpisodes } = await import('@/lib/mock-data')
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
      const episodes = await fetchAllEpisodes()
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

export async function getRelatedEpisodes(
  episodeId: string,
  topicIds: string[],
  limit: number = 3
): Promise<Episode[]> {
  if (topicIds.length === 0) return []

  if (USE_YOUTUBE) {
    try {
      const episodes = await fetchAllEpisodes()
      return episodes
        .filter(e => e.id !== episodeId)
        .slice(0, limit)
    } catch (error) {
      console.error('YouTube fetch failed, falling back:', error)
    }
  }

  if (USE_MOCK_DATA) {
    const { mockEpisodes } = await import('@/lib/mock-data')
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
    const { mockEpisodes } = await import('@/lib/mock-data')
    return mockEpisodes.filter(e => e.id !== episodeId).slice(0, limit)
  }

  return data || []
}

export async function getEpisodesByTopicPath(topicSlugs: string[]): Promise<Episode[]> {
  if (USE_YOUTUBE) {
    try {
      const episodes = await fetchAllEpisodes()
      return episodes
        .filter(e => e.topics?.some(t => topicSlugs.includes(t.slug)))
        .slice(0, 5)
    } catch (error) {
      console.error('YouTube fetch failed, falling back:', error)
    }
  }

  if (USE_MOCK_DATA) {
    const { mockEpisodes } = await import('@/lib/mock-data')
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
    const { mockEpisodes } = await import('@/lib/mock-data')
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
    const { mockEpisodes } = await import('@/lib/mock-data')
    return mockEpisodes.slice(0, 5)
  }

  return data || []
}

export async function getEpisodeCounts(): Promise<Record<string, number>> {
  let episodes: Episode[] = []

  if (USE_YOUTUBE) {
    try {
      episodes = await fetchAllEpisodes()
    } catch (error) {
      console.error('YouTube fetch failed:', error)
    }
  }

  if (episodes.length === 0 && USE_MOCK_DATA) {
    const { mockEpisodes } = await import('@/lib/mock-data')
    episodes = mockEpisodes
  }

  // Filter out hidden episodes
  const hiddenIds = await getHiddenEpisodeIds()
  if (hiddenIds.size > 0) {
    episodes = episodes.filter((e) => !hiddenIds.has(e.id))
  }

  return {
    all: episodes.length,
    'season-1': filterByCategory(episodes, 'season-1').length,
    'season-2': filterByCategory(episodes, 'season-2').length,
    clips: filterByCategory(episodes, 'clips').length,
    unreleased: filterByCategory(episodes, 'unreleased').length,
  }
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
