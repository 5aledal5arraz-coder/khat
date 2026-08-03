"use client"

import Image from "next/image"
import { useState } from "react"
import { cn } from "@/lib/utils"
import { episodeThumbSources } from "@/lib/episodes/thumbnail"
import { KhatMarkPanel } from "./khat-mark-panel"
import type { Episode } from "@/types/database"

type ThumbSubject = Pick<Episode, "title" | "thumbnail_url" | "youtube_url">

/**
 * The ONLY component on the public site that paints an episode's frame.
 *
 * It replaced four: `episode-card.tsx` (next/image, grayscale, dark blur
 * placeholder), `episode-poster-card.tsx` (a raw `<img>`, full colour),
 * `youtube-embed.tsx` and the block inlined into `app/quotes/[id]/page.tsx`.
 * They disagreed on saturation, on error handling, on `sizes`, and on what was
 * allowed to be drawn over the image.
 *
 * THREE RULES IT ENFORCES, all of them consequences of what our thumbnails
 * actually are — 41 hand-composed 16:9 posters with the title BURNED INTO the
 * artwork, a third of the frame for the face and two thirds for the type:
 *
 *  · **Full colour, always.** The `grayscale group-hover:grayscale-0` this
 *    removed erased the only colour the archive has — the same indigo (#5753a8)
 *    carries 35 of the 41 posters — and it ran on some pages and not others, so
 *    one episode appeared grey on a guest page and coloured on `/episodes`.
 *  · **Nothing on top.** No gradient, no badge, no duration chip. Every one of
 *    those lands on type we do not control and cannot move. Duration and
 *    category belong in the card body, below the frame.
 *  · **`sizes` is required, not optional.** Without it `next/image` with `fill`
 *    requests a 100vw source for a third-of-a-row card.
 *
 * A client component only because the fallback ladder needs `onError`; it is a
 * leaf, so the cards and pages around it stay server-rendered.
 */
export function EpisodeThumb({
  ep,
  sizes,
  priority,
  className,
}: {
  ep: ThumbSubject
  /** Rendered width per breakpoint — see the note above; there is no default. */
  sizes: string
  priority?: boolean
  className?: string
}) {
  const sources = episodeThumbSources(ep)
  const [index, setIndex] = useState(0)
  const src = sources[index]

  if (!src) return <KhatMarkPanel markClassName="text-title" />

  return (
    <Image
      src={src}
      alt={ep.title}
      fill
      sizes={sizes}
      priority={priority}
      onError={() => setIndex((i) => i + 1)}
      className={cn("object-cover", className)}
    />
  )
}
