import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Truncates text to a maximum length, respecting word boundaries.
 * Works correctly with Arabic text and RTL content.
 */
export function truncateText(text: string, maxLength: number, suffix = "..."): string {
  if (!text || text.length <= maxLength) {
    return text
  }

  // Account for suffix length
  const truncateAt = maxLength - suffix.length

  // Find the last space before the truncation point to avoid cutting words
  const lastSpace = text.lastIndexOf(" ", truncateAt)

  // If there's a space within reasonable distance, truncate there
  // Otherwise, just truncate at the max length
  const cutoff = lastSpace > truncateAt * 0.7 ? lastSpace : truncateAt

  return text.slice(0, cutoff).trim() + suffix
}

export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  if (hours > 0) {
    return `${hours}:${mins.toString().padStart(2, '0')}`
  }
  return `${mins} دقيقة`
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat('ar-SA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(date))
}

export function formatTimeSeconds(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60

  if (hours > 0) {
    return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

export function getYouTubeEmbedUrl(url: string, startTime?: number): string {
  const videoIdMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\s]+)/)
  if (!videoIdMatch) return url

  const videoId = videoIdMatch[1]
  let embedUrl = `https://www.youtube-nocookie.com/embed/${videoId}`

  if (startTime) {
    embedUrl += `?start=${startTime}`
  }

  return embedUrl
}

export function getYouTubeWatchUrl(url: string, startTime?: number): string {
  const videoIdMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\s]+)/)
  if (!videoIdMatch) return url

  const videoId = videoIdMatch[1]
  let watchUrl = `https://www.youtube.com/watch?v=${videoId}`

  if (startTime) {
    watchUrl += `&t=${startTime}`
  }

  return watchUrl
}
