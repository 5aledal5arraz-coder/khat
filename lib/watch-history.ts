import { getYouTubeId } from "@/lib/utils"

// Watch history management using localStorage

export interface WatchProgress {
  episodeId: string
  title: string
  slug: string
  thumbnailUrl: string
  progress: number // 0-100 percentage
  lastWatched: string // ISO date
  durationMinutes: number
}

const STORAGE_KEY = "khat-watch-history"
const MAX_HISTORY_ITEMS = 20

export function getWatchHistory(): WatchProgress[] {
  if (typeof window === "undefined") return []

  try {
    const data = localStorage.getItem(STORAGE_KEY)
    if (!data) return []
    return JSON.parse(data) as WatchProgress[]
  } catch {
    return []
  }
}

export function updateWatchProgress(episode: {
  id: string
  title: string
  slug: string
  youtube_url: string
  duration_minutes: number
}, progress: number): void {
  if (typeof window === "undefined") return

  const history = getWatchHistory()
  const existingIndex = history.findIndex((h) => h.episodeId === episode.id)

  const videoId = getYouTubeId(episode.youtube_url)
  const entry: WatchProgress = {
    episodeId: episode.id,
    title: episode.title,
    slug: episode.slug,
    thumbnailUrl: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
    progress: Math.round(Math.min(100, Math.max(0, progress))),
    lastWatched: new Date().toISOString(),
    durationMinutes: episode.duration_minutes,
  }

  if (existingIndex >= 0) {
    history[existingIndex] = entry
  } else {
    history.unshift(entry)
  }

  // Keep only the most recent items
  const trimmed = history.slice(0, MAX_HISTORY_ITEMS)

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed))
  } catch {
    // Storage full or unavailable
  }
}

export function getEpisodeProgress(episodeId: string): number {
  const history = getWatchHistory()
  const entry = history.find((h) => h.episodeId === episodeId)
  return entry?.progress || 0
}

export function getRecentlyViewed(): WatchProgress[] {
  const history = getWatchHistory()
  return history
    .sort((a, b) => new Date(b.lastWatched).getTime() - new Date(a.lastWatched).getTime())
    .slice(0, 5)
}

export function clearWatchHistory(): void {
  if (typeof window === "undefined") return
  localStorage.removeItem(STORAGE_KEY)
}
