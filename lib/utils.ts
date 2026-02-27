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

/**
 * Arabic plural forms: [singular, dual, plural (3-10)]
 * Rules: 0 → plural, 1 → singular + واحد/واحدة, 2 → dual,
 *        3-10 → number + plural, 11+ → number + singular
 */
const ARABIC_PLURALS: Record<string, [string, string, string]> = {
  "حلقة": ["حلقة", "حلقتان", "حلقات"],
  "مقال": ["مقال", "مقالان", "مقالات"],
  "متابع": ["متابع", "متابعان", "متابعين"],
  "دقيقة": ["دقيقة", "دقيقتين", "دقائق"],
  "ساعة": ["ساعة", "ساعتين", "ساعات"],
  "يوم": ["يوم", "يومين", "أيام"],
  "تعليق": ["تعليق", "تعليقان", "تعليقات"],
  "رد": ["رد", "ردّان", "ردود"],
  "اقتباس": ["اقتباس", "اقتباسان", "اقتباسات"],
}

export function formatArabicCount(count: number, singular: string): string {
  const forms = ARABIC_PLURALS[singular]
  if (!forms) return `${count} ${singular}`

  const [sing, dual, plural] = forms
  const isFeminine = sing.endsWith("ة")

  if (count === 0) return `لا ${plural}`
  if (count === 1) return `${sing} واحد${isFeminine ? "ة" : ""}`
  if (count === 2) return dual
  if (count <= 10) return `${count} ${plural}`
  return `${count} ${sing}`
}

export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  if (hours > 0) {
    return `${hours}:${mins.toString().padStart(2, '0')}`
  }
  return formatArabicCount(mins, "دقيقة")
}

const EN_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export function formatDate(date: string | Date): string {
  const d = new Date(date)
  const day = d.getDate()
  const month = EN_MONTHS[d.getMonth()]
  const year = d.getFullYear()
  return `${day} ${month} ${year}`
}

export function formatTimeSeconds(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(safeSeconds / 3600)
  const mins = Math.floor((safeSeconds % 3600) / 60)
  const secs = safeSeconds % 60

  if (hours > 0) {
    return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

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
