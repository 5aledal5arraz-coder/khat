import { type ClassValue, clsx } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

/**
 * tailwind-merge has to be TOLD about the type scale, or it deletes it.
 *
 * `twMerge` resolves conflicts by bucketing each class into a group. It ships
 * knowing Tailwind's own font sizes (`text-sm`, `text-lg`, …) but nothing
 * about the steps defined in `app/globals.css`, and a `text-*` class it cannot
 * place as a font size is treated as a text COLOUR. So a scale class and a
 * colour class landed in the same bucket and the scale class — always the
 * earlier of the two — was silently dropped. Measured 2026-08-02 with the
 * bare v3.4 merger:
 *
 *   twMerge("text-control text-primary-foreground") → "text-primary-foreground"
 *   twMerge("text-caption text-muted-foreground")   → "text-muted-foreground"
 *   twMerge("text-micro text-accent")               → "text-accent"
 *   twMerge("text-sm text-primary-foreground")      → BOTH survive
 *
 * The last line is the tell: only the keys twMerge already knew survived.
 * Live effect — the admin login button rendered with no size class at all and
 * inherited 16px where it had been 14px.
 *
 * This is nastier than it looks, because the element then falls back to an
 * INHERITED size that is usually itself a valid step — so a counter that only
 * asks "is every rendered size on the scale?" reports a clean zero while the
 * class is not actually being applied. It stayed invisible through wave 2 for
 * exactly that reason.
 *
 * Any new step added to `@theme` in globals.css must be added here too.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        {
          text: [
            // the eight brand steps
            "micro",
            "caption",
            "body",
            "lead",
            "subhead",
            "heading",
            "title",
            "display",
            // the shared components/ui primitive steps
            "control",
            "control-sm",
            "control-lead",
            "field",
          ],
        },
      ],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Re-export formatters from shared module for backward compatibility
export { formatArabicCount, formatDate, formatDuration, formatTimeSeconds, guestInitials } from "./shared/formatters"

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
