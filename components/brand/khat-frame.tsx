import { cn } from "@/lib/utils"
import { KhatDiamond } from "@/components/brand/khat-icon"

/**
 * The identity's frame, around whatever is put inside it.
 *
 * WHAT THIS REPLACED — AND WHY IT WAS WRONG. The first version copied the
 * designer's frame from `youtube break ADS REELS STORY ADS TRANDS.pdf` p.1
 * literally: a Deep Indigo surround 8.49% of the frame's width, measured
 * 62px on a 736px player, on all four sides. Khaled: «ما اعجبتني ابيك تفكر في
 * اطار بسيط». He was right, and the reason is a category error on my side.
 * On his artboard that surround is the SUBJECT — a poster whose content is
 * the frame, with a video inset in it as a detail. On an episode page the
 * video is the subject and the frame is punctuation. Copying the proportion
 * out of one context into the other reproduced the drawing and lost the point
 * of it.
 *
 * WHAT IS KEPT FROM HIM, EXACTLY:
 *  · **the 45° cut on the top-right corner.** Measured on his vector:
 *    (787.21, 127.96) → (1073.32, 414.07), Δx = Δy = 286.11. Exactly 45°, and
 *    not the same as the guest card's panel, which is 51.5°. Two distinct
 *    shapes in one identity; this is the frame's.
 *  · **the diamond on the ground beside the cut** — the dot of the خ, the same
 *    relationship it has on every other piece.
 *  · **Deep Indigo for the line, KHAT Orange for the diamond.**
 *
 * WHAT IS MINE, AND SAID PLAINLY: the line's WEIGHT and the cut's SIZE. His
 * surround is 8.49% of the width and his cut 26.25% — a cut that size takes a
 * real triangle out of the picture, which is free on a poster he composed for
 * it and not free on someone's episode. The line is 2px, and the cut is 10% of
 * the width. Those two numbers are the whole difference between his frame and
 * this one.
 *
 * `cqw` ON BOTH AXES IS WHAT MAKES THE CUT 45°. Container units resolve
 * against the container's WIDTH whichever axis they are used on, so `10cqw`
 * across and `10cqw` down is a true diagonal at any size. The first build drew
 * this as an SVG with `preserveAspectRatio="none"` and the 45° came out at 32°.
 */

/** The cut, as a share of the frame's width — mine, not his 26.25%. */
const CUT = 10
/** The hairline. */
const STROKE = 2

/** Rounded rect with the top-right corner replaced by a 45° diagonal. */
const CLIP = `polygon(0 0, calc(100% - ${CUT}cqw) 0, 100% ${CUT}cqw, 100% 100%, 0 100%)`

export function KhatFrame({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    // The container is the WRAPPER, never the frame itself: an element does not
    // establish a container for its own properties, and with `container-type`
    // on the frame its own `cqw` resolved against the viewport instead.
    <div className={cn("relative", className)} style={{ containerType: "inline-size" }}>
      {/* THE LINE IS TWO CLIPPED BOXES, NOT A STROKE.
          Drawing it as an SVG path needed a viewBox matching the frame's real
          aspect to keep the diagonal at 45° — and the frame is NOT 16:9. It
          measured 896x545 (1.645), because the player's box carries more than
          the video. So the outline is an indigo plate with the cut, and the
          picture is the same cut inset by the line's width: the ring that shows
          between them IS the line, and it cannot disagree with the corner
          because both are cut by the same formula. */}
      <div
        className="rounded-2xl bg-primary"
        style={{ clipPath: CLIP, padding: STROKE }}
      >
        {/* `bg-card` IS THE FIX FOR A 40px INDIGO BAND. Without a background of
            its own, the plate showed through wherever the content is
            transparent — and `<YouTubeEmbed>` is not just a player, it is a
            `space-y-2` stack of the 16:9 frame (892x502) and a «شاهد على
            يوتيوب» link (90x25). The gap and the space beside that link were
            painting indigo, and the link's muted grey landed on it unreadable.
            With a surface here, only the 2px ring is the line. */}
        <div
          className="overflow-hidden rounded-[14px] bg-card"
          style={{ clipPath: CLIP }}
        >
          {children}
        </div>
      </div>

      {/* In the notch the cut opens, on the page's own ground. Half of it sits
          over the corner and half outside — the same way it sits half on the
          panel's edge in the guest card. */}
      <span
        aria-hidden
        className="pointer-events-none absolute"
        style={{ insetInlineStart: `${CUT * 0.34}cqw`, top: `${CUT * 0.34}cqw` }}
      >
        <KhatDiamond tone="accent" className="h-[2.4cqw] w-[2.4cqw] min-h-2.5 min-w-2.5" />
      </span>
    </div>
  )
}
