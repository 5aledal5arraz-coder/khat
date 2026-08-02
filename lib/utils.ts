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
 *
 * THE SAME HOLE EXISTED FOR LEADING, one namespace over, and it has TWO sides.
 *
 * Leave a custom `--leading-*` unregistered and it lands in no group at all:
 * it does not merge and it does not lose — it simply coexists with whatever
 * `leading-*` the caller passes, and the winner is decided by stylesheet order
 * rather than by argument order. `--leading-prose` shipped in wave 2 like that.
 *
 * But registering it into twMerge's own `leading` group is ALSO wrong, and
 * measurably so. twMerge declares `font-size` as CONFLICTING WITH `leading` —
 * correct for Tailwind's own steps, where `text-sm` carries a paired
 * line-height — so a caller's later `text-*` DELETES an earlier `leading-*`.
 * Measured 2026-08-02 on /admin/settings, with `leading-control` registered in
 * the built-in group:
 *
 *   cn("text-control-lead font-semibold leading-control",   ← CardTitle's base
 *      "text-[13px] font-semibold flex items-center gap-2") ← the call site
 *   → "text-[13px] font-semibold flex items-center gap-2"
 *
 * `leading-control` gone, and all twelve admin card titles rendered at 19.5px
 * of leading on 13px Arabic — i.e. the collision this wave exists to remove was
 * still live, in the exact place a green suite would never look.
 *
 * That conflict does not even hold in Tailwind v4: `leading-*` sets
 * `--tw-leading`, and a step's paired line-height reads
 * `var(--tw-leading, <paired>)`, so an explicit leading wins in CSS no matter
 * which class came first. So our tokens get their OWN group, which `font-size`
 * does not conflict with, plus a two-way conflict with the built-in `leading`
 * so ours and Tailwind's still override each other by argument order.
 *
 * AND THE SAME HOLE EXISTED A THIRD TIME, for `--container-measure`.
 *
 * `max-w-measure` — the Arabic line-length cap — landed in NO group at all, the
 * `--leading-prose` failure mode: it neither merges nor loses, so
 * `cn("max-w-measure", "max-w-2xl")` kept BOTH and the stylesheet decided.
 * Latent when found (all 23 call sites are literal className strings and none
 * passes a second `max-w-*` through `cn()`), so nothing on screen was wrong —
 * but it is the identical defect twice repaired above, sitting in a namespace
 * neither repair looked at.
 *
 * The lesson is the reason the guard changed shape: registering the tokens we
 * REMEMBER is what produced three of these. `@theme` mints a utility for every
 * key in a Tailwind namespace, so the guard now enumerates that block and
 * demands each minted class land in the right group — a new key is a failing
 * test until it is registered here.
 *
 * Any new step, leading or container token added to `@theme` in globals.css
 * must be added here too — tests/type-scale-guards.test.ts enforces all three.
 */
// The generic parameter declares the class-group id we are ADDING, so
// "khat-leading" type-checks as a group in both `classGroups` and
// `conflictingClassGroups`. Without it twMerge only accepts its own ids.
const twMerge = extendTailwindMerge<"khat-leading">({
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
      // A group of our own — NOT twMerge's `leading`. See above.
      "khat-leading": [
        {
          leading: [
            "prose",   // body leading at a headline size
            "control", // the shared kit's heading leading
          ],
        },
      ],
      // `--container-measure` → `max-w-measure`. twMerge's own `max-w` group is
      // right here: a width cap genuinely conflicts with another width cap, and
      // nothing in a different namespace should ever delete it.
      "max-w": [{ "max-w": ["measure"] }],
    },
    conflictingClassGroups: {
      // Ours replaces Tailwind's, and Tailwind's replaces ours — but neither
      // is touched by a font-size.
      "khat-leading": ["leading"],
      leading: ["khat-leading"],
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
