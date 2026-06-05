import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Re-export formatters from shared module for backward compatibility
export { formatArabicCount, formatDate, formatDuration, formatTimeSeconds } from "./shared/formatters"

export function getYouTubeId(url: string): string {
  // Handle watch URLs: v= can be the first or any query param
  const watchMatch = url.match(/youtube\.com\/watch[^#]*[?&]v=([a-zA-Z0-9_-]{11})/)
  if (watchMatch) return watchMatch[1]
  // Handle youtu.be, embed, shorts — capture exactly 11-char ID
  const shortMatch = url.match(/(?:youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/)
  return shortMatch ? shortMatch[1] : ''
}

export function getYouTubeEmbedUrl(url: string, startTime?: number): string {
  const videoId = getYouTubeId(url)
  if (!videoId) return url
  const params = new URLSearchParams({ playsinline: "1", rel: "0" })
  if (startTime) params.set("start", String(startTime))
  return `https://www.youtube-nocookie.com/embed/${videoId}?${params.toString()}`
}

export function getYouTubeWatchUrl(url: string, startTime?: number): string {
  const videoId = getYouTubeId(url)
  if (!videoId) return url
  let watchUrl = `https://www.youtube.com/watch?v=${videoId}`

  if (startTime) {
    watchUrl += `&t=${startTime}`
  }

  return watchUrl
}
