const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY
const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3"

export interface YouTubeChannel {
  id: string
  title: string
  description: string
  customUrl: string
  thumbnailUrl: string
  subscriberCount: number
  videoCount: number
  viewCount: number
}

export interface YouTubeVideo {
  id: string
  title: string
  description: string
  publishedAt: string
  thumbnailUrl: string
  thumbnailHigh: string
  duration: string
  durationSeconds: number
  viewCount: number
  likeCount: number
  commentCount: number
  tags: string[]
}

export interface YouTubePlaylist {
  id: string
  title: string
  description: string
  thumbnailUrl: string
  itemCount: number
  publishedAt: string
}

async function fetchYouTube<T>(endpoint: string, params: Record<string, string>): Promise<T> {
  if (!YOUTUBE_API_KEY) {
    throw new Error("YouTube API key not configured")
  }

  const url = new URL(`${YOUTUBE_API_BASE}/${endpoint}`)
  url.searchParams.set("key", YOUTUBE_API_KEY)

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value)
  }

  const response = await fetch(url.toString(), {
    next: { revalidate: 43200 }, // Cache for 12 hours
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(`YouTube API error: ${error.error?.message || response.statusText}`)
  }

  return response.json()
}

/**
 * Get channel ID from handle (e.g., @KhatPodcast)
 */
export async function getChannelIdFromHandle(handle: string): Promise<string | null> {
  const cleanHandle = handle.startsWith("@") ? handle.slice(1) : handle

  const data = await fetchYouTube<{
    items?: Array<{ id: string }>
  }>("channels", {
    forHandle: cleanHandle,
    part: "id",
  })

  return data.items?.[0]?.id || null
}

/**
 * Get channel details
 */
export async function getChannelDetails(channelId: string): Promise<YouTubeChannel | null> {
  const data = await fetchYouTube<{
    items?: Array<{
      id: string
      snippet: {
        title: string
        description: string
        customUrl: string
        thumbnails: { high: { url: string } }
      }
      statistics: {
        subscriberCount: string
        videoCount: string
        viewCount: string
      }
    }>
  }>("channels", {
    id: channelId,
    part: "snippet,statistics",
  })

  const channel = data.items?.[0]
  if (!channel) return null

  return {
    id: channel.id,
    title: channel.snippet.title,
    description: channel.snippet.description,
    customUrl: channel.snippet.customUrl,
    thumbnailUrl: channel.snippet.thumbnails.high.url,
    subscriberCount: parseInt(channel.statistics.subscriberCount, 10),
    videoCount: parseInt(channel.statistics.videoCount, 10),
    viewCount: parseInt(channel.statistics.viewCount, 10),
  }
}

/**
 * Parse ISO 8601 duration to seconds
 */
function parseDuration(duration: string): number {
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
  if (!match) return 0

  const hours = parseInt(match[1] || "0", 10)
  const minutes = parseInt(match[2] || "0", 10)
  const seconds = parseInt(match[3] || "0", 10)

  return hours * 3600 + minutes * 60 + seconds
}

/**
 * Get all videos from a channel (handles pagination)
 */
export async function getChannelVideos(channelId: string, maxResults = 500): Promise<YouTubeVideo[]> {
  const videos: YouTubeVideo[] = []
  let pageToken: string | undefined

  // First, get the uploads playlist ID
  const channelData = await fetchYouTube<{
    items?: Array<{
      contentDetails: {
        relatedPlaylists: { uploads: string }
      }
    }>
  }>("channels", {
    id: channelId,
    part: "contentDetails",
  })

  const uploadsPlaylistId = channelData.items?.[0]?.contentDetails.relatedPlaylists.uploads
  if (!uploadsPlaylistId) return []

  // Fetch all video IDs from the uploads playlist
  const videoIds: string[] = []

  do {
    const playlistData = await fetchYouTube<{
      items?: Array<{
        contentDetails: { videoId: string }
      }>
      nextPageToken?: string
    }>("playlistItems", {
      playlistId: uploadsPlaylistId,
      part: "contentDetails",
      maxResults: "50",
      ...(pageToken && { pageToken }),
    })

    for (const item of playlistData.items || []) {
      videoIds.push(item.contentDetails.videoId)
    }

    pageToken = playlistData.nextPageToken
  } while (pageToken && videoIds.length < maxResults)

  // Fetch video details in batches of 50
  for (let i = 0; i < videoIds.length; i += 50) {
    const batch = videoIds.slice(i, i + 50)

    const videoData = await fetchYouTube<{
      items?: Array<{
        id: string
        snippet: {
          title: string
          description: string
          publishedAt: string
          tags?: string[]
          thumbnails: {
            medium: { url: string }
            high: { url: string }
            maxres?: { url: string }
          }
        }
        contentDetails: {
          duration: string
        }
        statistics: {
          viewCount: string
          likeCount: string
          commentCount: string
        }
      }>
    }>("videos", {
      id: batch.join(","),
      part: "snippet,contentDetails,statistics",
    })

    for (const video of videoData.items || []) {
      const durationSeconds = parseDuration(video.contentDetails.duration)

      videos.push({
        id: video.id,
        title: video.snippet.title,
        description: video.snippet.description,
        publishedAt: video.snippet.publishedAt,
        thumbnailUrl: video.snippet.thumbnails.medium.url,
        thumbnailHigh: video.snippet.thumbnails.maxres?.url || video.snippet.thumbnails.high.url,
        duration: video.contentDetails.duration,
        durationSeconds,
        viewCount: parseInt(video.statistics.viewCount || "0", 10),
        likeCount: parseInt(video.statistics.likeCount || "0", 10),
        commentCount: parseInt(video.statistics.commentCount || "0", 10),
        tags: video.snippet.tags || [],
      })
    }
  }

  return videos
}

/**
 * Get channel playlists
 */
export async function getChannelPlaylists(channelId: string): Promise<YouTubePlaylist[]> {
  const playlists: YouTubePlaylist[] = []
  let pageToken: string | undefined

  do {
    const data = await fetchYouTube<{
      items?: Array<{
        id: string
        snippet: {
          title: string
          description: string
          publishedAt: string
          thumbnails: { high: { url: string } }
        }
        contentDetails: {
          itemCount: number
        }
      }>
      nextPageToken?: string
    }>("playlists", {
      channelId,
      part: "snippet,contentDetails",
      maxResults: "50",
      ...(pageToken && { pageToken }),
    })

    for (const playlist of data.items || []) {
      playlists.push({
        id: playlist.id,
        title: playlist.snippet.title,
        description: playlist.snippet.description,
        thumbnailUrl: playlist.snippet.thumbnails.high.url,
        itemCount: playlist.contentDetails.itemCount,
        publishedAt: playlist.snippet.publishedAt,
      })
    }

    pageToken = data.nextPageToken
  } while (pageToken)

  return playlists
}

/**
 * Get full video details by IDs (useful for unlisted videos not in uploads)
 */
export async function getVideosByIds(videoIds: string[]): Promise<YouTubeVideo[]> {
  const videos: YouTubeVideo[] = []

  for (let i = 0; i < videoIds.length; i += 50) {
    const batch = videoIds.slice(i, i + 50)

    const videoData = await fetchYouTube<{
      items?: Array<{
        id: string
        snippet: {
          title: string
          description: string
          publishedAt: string
          tags?: string[]
          thumbnails: {
            medium: { url: string }
            high: { url: string }
            maxres?: { url: string }
          }
        }
        contentDetails: {
          duration: string
        }
        statistics: {
          viewCount: string
          likeCount: string
          commentCount: string
        }
      }>
    }>("videos", {
      id: batch.join(","),
      part: "snippet,contentDetails,statistics",
    })

    for (const video of videoData.items || []) {
      const durationSeconds = parseDuration(video.contentDetails.duration)

      videos.push({
        id: video.id,
        title: video.snippet.title,
        description: video.snippet.description,
        publishedAt: video.snippet.publishedAt,
        thumbnailUrl: video.snippet.thumbnails.medium.url,
        thumbnailHigh: video.snippet.thumbnails.maxres?.url || video.snippet.thumbnails.high.url,
        duration: video.contentDetails.duration,
        durationSeconds,
        viewCount: parseInt(video.statistics.viewCount || "0", 10),
        likeCount: parseInt(video.statistics.likeCount || "0", 10),
        commentCount: parseInt(video.statistics.commentCount || "0", 10),
        tags: video.snippet.tags || [],
      })
    }
  }

  return videos
}

/**
 * Get videos from a specific playlist
 */
export async function getPlaylistVideos(playlistId: string): Promise<string[]> {
  const videoIds: string[] = []
  let pageToken: string | undefined

  do {
    const data = await fetchYouTube<{
      items?: Array<{
        contentDetails: { videoId: string }
      }>
      nextPageToken?: string
    }>("playlistItems", {
      playlistId,
      part: "contentDetails",
      maxResults: "50",
      ...(pageToken && { pageToken }),
    })

    for (const item of data.items || []) {
      videoIds.push(item.contentDetails.videoId)
    }

    pageToken = data.nextPageToken
  } while (pageToken)

  return videoIds
}
