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
  mockEpisodes,
  mockGuests,
  mockTopics,
  mockTimestamps,
  mockQuotes,
  mockResources
} from '@/lib/mock-data'

const USE_MOCK_DATA = process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('placeholder') || !process.env.NEXT_PUBLIC_SUPABASE_URL

export async function getEpisodes(options?: {
  topicSlug?: string
  guestSlug?: string
  season?: number
  search?: string
  limit?: number
  offset?: number
}): Promise<Episode[]> {
  if (USE_MOCK_DATA) {
    let episodes = [...mockEpisodes]

    if (options?.search) {
      const search = options.search.toLowerCase()
      episodes = episodes.filter(e =>
        e.title.toLowerCase().includes(search) ||
        e.summary?.toLowerCase().includes(search)
      )
    }

    if (options?.season) {
      episodes = episodes.filter(e => e.season === options.season)
    }

    if (options?.guestSlug) {
      episodes = episodes.filter(e => e.guest?.slug === options.guestSlug)
    }

    if (options?.limit) {
      episodes = episodes.slice(0, options.limit)
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
    return mockEpisodes
  }

  return data || []
}

export async function getEpisodeBySlug(slug: string): Promise<EpisodeWithRelations | null> {
  if (USE_MOCK_DATA) {
    const episode = mockEpisodes.find(e => e.slug === slug)
    if (!episode) return null

    return {
      ...episode,
      guest: episode.guest || null,
      topics: episode.topics?.map(t => t.topic) || [],
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
    const mockEp = mockEpisodes.find(e => e.slug === slug)
    if (mockEp) {
      return {
        ...mockEp,
        guest: mockEp.guest || null,
        topics: mockEp.topics?.map(t => t.topic) || [],
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
  if (USE_MOCK_DATA) {
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
    return mockEpisodes[0] || null
  }

  return data
}

export async function getGuests(options?: {
  search?: string
  topicSlug?: string
}): Promise<Guest[]> {
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
  if (USE_MOCK_DATA) {
    const guest = mockGuests.find(g => g.slug === slug)
    if (!guest) return null

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

  if (USE_MOCK_DATA) {
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
    return mockEpisodes.filter(e => e.id !== episodeId).slice(0, limit)
  }

  return data || []
}

export async function getEpisodesByTopicPath(topicSlugs: string[]): Promise<Episode[]> {
  if (USE_MOCK_DATA) {
    return mockEpisodes.filter(e =>
      e.topics?.some(t => topicSlugs.includes(t.topic.slug))
    ).slice(0, 5)
  }

  const supabase = await createClient()

  const { data: topics } = await supabase
    .from('topics')
    .select('id')
    .in('slug', topicSlugs)

  if (!topics || topics.length === 0) {
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
    return mockEpisodes.slice(0, 5)
  }

  return data || []
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
