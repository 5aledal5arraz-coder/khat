import { env } from "@/lib/env"
import {
  getChannelIdFromHandle,
  getChannelDetails,
  getChannelVideos,
  getChannelPlaylists,
  getPlaylistVideos,
  getVideosByIds,
  type YouTubeVideo,
  type YouTubePlaylist,
  type YouTubeChannel,
} from "./client"
import type { Episode } from "@/types/database"

const CHANNEL_HANDLE = env.YOUTUBE_CHANNEL_HANDLE || "@KhatPodcast"
const EXTRA_PLAYLIST_IDS = (env.YOUTUBE_EXTRA_PLAYLIST_IDS || "")
  .split(",")
  .map((id) => id.trim())
  .filter(Boolean)

// Cache the channel ID
let cachedChannelId: string | null = null

async function getChannelId(): Promise<string> {
  if (cachedChannelId) return cachedChannelId

  const channelId = await getChannelIdFromHandle(CHANNEL_HANDLE)
  if (!channelId) {
    throw new Error(`Could not find channel: ${CHANNEL_HANDLE}`)
  }

  cachedChannelId = channelId
  return channelId
}

/**
 * Generate a URL-friendly slug from a video title
 */
function generateSlug(title: string, videoId: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^\u0600-\u06FFa-z0-9\s-]/g, "") // Keep Arabic, Latin, numbers, spaces, hyphens
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60)

  return slug || videoId
}

/**
 * Extract episode number from title if present
 */
function extractEpisodeNumber(title: string): number | null {
  // Match patterns like "#123", "EP123", "حلقة 123", "الحلقة 123"
  const patterns = [
    /#(\d+)/,
    /EP\.?\s*(\d+)/i,
    /حلقة\s*(\d+)/,
    /الحلقة\s*(\d+)/,
    /Episode\s*(\d+)/i,
  ]

  for (const pattern of patterns) {
    const match = title.match(pattern)
    if (match) {
      return parseInt(match[1], 10)
    }
  }

  return null
}

/**
 * Extract guest name from title if present
 */
function extractGuestName(title: string): string | null {
  // Common patterns: "مع فلان", "| فلان", "- فلان"
  const patterns = [
    /مع\s+([^|#\-–]+)/,
    /\|\s*([^|#\-–]+)$/,
    /-\s*([^|#\-–]+)$/,
    /–\s*([^|#\-–]+)$/,
  ]

  for (const pattern of patterns) {
    const match = title.match(pattern)
    if (match) {
      return match[1].trim()
    }
  }

  return null
}

/**
 * Convert YouTube video to Episode format
 */
function videoToEpisode(video: YouTubeVideo, index: number): Episode {
  const episodeNumber = extractEpisodeNumber(video.title) || index + 1
  const guestName = extractGuestName(video.title)

  return {
    id: video.id,
    title: video.title,
    slug: generateSlug(video.title, video.id),
    description: video.description,
    youtube_url: `https://www.youtube.com/watch?v=${video.id}`,
    duration_minutes: Math.round(video.durationSeconds / 60),
    release_date: video.publishedAt,
    episode_number: episodeNumber,
    season: null,
    thumbnail_url: video.thumbnailHigh,
    status: "published",
    featured: false,
    view_count: video.viewCount,
    created_at: video.publishedAt,
    updated_at: video.publishedAt,
    // Extended fields from YouTube
    guest: guestName ? {
      id: `guest-${video.id}`,
      name: guestName,
      slug: generateSlug(guestName, video.id),
      bio: null,
      photo_url: null,
      external_links: null,
      testimonial: null,
      created_at: video.publishedAt,
    } : null,
  }
}

/**
 * Fetch all episodes from YouTube (uploads + extra playlists)
 */
export async function fetchAllEpisodes(): Promise<Episode[]> {
  const channelId = await getChannelId()
  const videos = await getChannelVideos(channelId)

  // Also fetch videos from extra playlists (e.g. unlisted videos)
  if (EXTRA_PLAYLIST_IDS.length > 0) {
    const existingIds = new Set(videos.map((v) => v.id))

    // Fetch video IDs from all extra playlists in parallel
    const playlistResults = await Promise.all(
      EXTRA_PLAYLIST_IDS.map((plId) => getPlaylistVideos(plId))
    )

    // Collect IDs not already in uploads
    const newIds: string[] = []
    for (const ids of playlistResults) {
      for (const id of ids) {
        if (!existingIds.has(id)) {
          existingIds.add(id)
          newIds.push(id)
        }
      }
    }

    // Fetch full details for the new videos
    if (newIds.length > 0) {
      const extraVideos = await getVideosByIds(newIds)
      videos.push(...extraVideos)
    }
  }

  // Sort by publish date (newest first)
  videos.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())

  return videos.map((video, index) => videoToEpisode(video, videos.length - index - 1))
}

/**
 * Fetch episodes with pagination
 */
export async function fetchEpisodes(options: {
  limit?: number
  offset?: number
  search?: string
} = {}): Promise<Episode[]> {
  const { limit = 20, offset = 0, search } = options

  let episodes = await fetchAllEpisodes()

  if (search) {
    const searchLower = search.toLowerCase()
    episodes = episodes.filter(
      (ep) =>
        ep.title.toLowerCase().includes(searchLower) ||
        ep.description?.toLowerCase().includes(searchLower)
    )
  }

  return episodes.slice(offset, offset + limit)
}

/**
 * Fetch a single episode by slug or ID
 */
export async function fetchEpisodeBySlug(slug: string): Promise<Episode | null> {
  const episodes = await fetchAllEpisodes()
  return episodes.find((ep) => ep.slug === slug || ep.id === slug) || null
}

/**
 * Fetch the latest episode
 */
export async function fetchLatestEpisode(): Promise<Episode | null> {
  const episodes = await fetchAllEpisodes()
  return episodes[0] || null
}

/**
 * Fetch the most viewed episode from recent uploads (last 30 days)
 */
export async function fetchMostViewedRecent(days: number = 30): Promise<Episode | null> {
  const episodes = await fetchAllEpisodes()
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - days)

  const recentEpisodes = episodes.filter(
    (ep) => new Date(ep.release_date) >= cutoffDate
  )

  if (recentEpisodes.length === 0) {
    // Fallback to all episodes if none in the time range
    return episodes.sort((a, b) => (b.view_count || 0) - (a.view_count || 0))[0] || null
  }

  return recentEpisodes.sort((a, b) => (b.view_count || 0) - (a.view_count || 0))[0] || null
}

/**
 * Fetch channel info
 */
export async function fetchChannelInfo(): Promise<YouTubeChannel | null> {
  const channelId = await getChannelId()
  return getChannelDetails(channelId)
}

/**
 * Fetch all playlists (can be used as "series")
 */
export async function fetchPlaylists(): Promise<YouTubePlaylist[]> {
  const channelId = await getChannelId()
  return getChannelPlaylists(channelId)
}

/**
 * Fetch episodes from a specific playlist
 */
export async function fetchPlaylistEpisodes(playlistId: string): Promise<Episode[]> {
  const [allEpisodes, playlistVideoIds] = await Promise.all([
    fetchAllEpisodes(),
    getPlaylistVideos(playlistId),
  ])

  const playlistIdSet = new Set(playlistVideoIds)
  return allEpisodes.filter((ep) => playlistIdSet.has(ep.id))
}

/**
 * Get episode count
 */
export async function fetchEpisodeCount(): Promise<number> {
  const episodes = await fetchAllEpisodes()
  return episodes.length
}

/**
 * Get total views across all episodes
 */
export async function fetchTotalViews(): Promise<number> {
  const episodes = await fetchAllEpisodes()
  return episodes.reduce((total, ep) => total + (ep.view_count || 0), 0)
}
