import { Play } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * The one play control the site draws over an image.
 *
 * Six different ones used to exist — 64px in the episode player, 56px on the
 * episode page's guest video, 48px on both episode cards, 44px on the inline
 * teaser, 40px on the quote page — none of them sharing a component.
 *
 * WHERE IT MAY APPEAR. Only where clicking actually starts a video. Episode
 * CARDS no longer carry one: their whole surface is already a link to the
 * episode page, the affordance existed on hover only (so it never appeared on a
 * phone at all), and our thumbnails have the title burned into the artwork —
 * anything laid over them lands on type we cannot move. See `EpisodeThumb`.
 *
 * The YouTube player's own red button is NOT this component and must not become
 * it: it is YouTube's mark, it tells the visitor where the video plays, and
 * routing it through a KHAT component would repaint a third party's brand the
 * next time our palette moves. That exception is stated in `youtube-embed.tsx`.
 *
 * The triangle is not RTL-flipped — a transport control is a universal glyph.
 */
export function PlayBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-14 w-14 items-center justify-center rounded-full bg-black/55 backdrop-blur transition-transform",
        className,
      )}
    >
      <Play className="h-5 w-5 fill-current text-white" aria-hidden="true" />
    </span>
  )
}
