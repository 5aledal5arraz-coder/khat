import { cn } from "@/lib/utils"
import { KhatDiamond } from "@/components/brand/khat-icon"

/**
 * The identity's frame, around whatever is put inside it.
 *
 * The designer draws this in `youtube break ADS REELS STORY ADS TRANDS.pdf` p.1
 * — a thick Deep Indigo surround with the top-right corner replaced by a 45°
 * diagonal, holding the episode's video. Measured off that vector on its own
 * 1920x1080 artboard:
 *
 *   outer      1089.98 x 647.21, from (0, 102.37)
 *   window     inset 92.50 on every side — measured on all four, not assumed
 *   corners    r = 87.39, 13.5% of the frame's height
 *   the cut    (787.21, 127.96) → (1073.32, 414.07): Δx = Δy = 286.11, so
 *              EXACTLY 45°, and 26.25% of the frame's width. Unlike the guest
 *              card's panel, which is 51.5°. Two different shapes in one
 *              identity; neither is the other.
 *
 * ONE NUMBER IS NOT HIS: THE SURROUND'S WIDTH. On his artboard it is 92.5
 * against a 462-tall window — 20% of the picture — because there it is a
 * graphic on a poster and the video is an inset detail. On an episode page the
 * video IS the page, so it is taken as a share of the frame's WIDTH (his own
 * 92.5/1089.98 = 8.49%), which keeps the proportion recognisable at a size a
 * reader can still watch inside.
 *
 * WHY `clip-path` AND `cqw`, NOT AN SVG. The first build drew the frame as an
 * SVG path with `preserveAspectRatio="none"`. That stretches the geometry to
 * the box: on a 736x468 frame the 45° cut came out at 32°, and the border was
 * 62px across but 43px down while the CSS padding was 62px on all four sides —
 * a percentage padding resolves against WIDTH on every side. The drawn window
 * and the actual content stopped agreeing. Container units fix both: `cqw` is
 * a share of the wrapper's width whichever axis it is used on, so a cut that is
 * `26.25cqw` in x and `26.25cqw` in y is a true 45° at any size.
 */

/** 92.5/1089.98 — the surround, as a share of the frame's width. */
const BORDER = "8.49cqw"
/** 286.11/1089.98 — the 45° cut, as a share of the frame's width. */
const CUT = "26.25cqw"
/** The same cut, one border in from the outer edge, for the window. */
const INNER_CUT = "17.76cqw"

/** Rounded rect with the top-right corner replaced by a 45° diagonal. */
const clipWith = (cut: string) =>
  `polygon(0 0, calc(100% - ${cut}) 0, 100% ${cut}, 100% 100%, 0 100%)`

export function KhatFrame({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    // THE CONTAINER IS THE WRAPPER, NOT THE FRAME ITSELF. An element does not
    // establish a container for its own properties — with `container-type` on
    // the frame, its own `padding: 8.49cqw` resolved against the viewport
    // instead and measured 71px on an 835px window rather than the 62px its
    // 736px box calls for. One level out, and every `cqw` below is a share of
    // the frame's real width.
    <div className={cn("relative", className)} style={{ containerType: "inline-size" }}>
      <div
        className="relative rounded-3xl bg-primary"
        style={{ clipPath: clipWith(CUT), padding: BORDER }}
      >
        {/* The window. It carries the same cut so the diagonal runs through
            both edges of the surround as one line, which is what makes it read
            as a frame rather than a box with a notch. */}
        <div
          className="overflow-hidden rounded-xl"
          style={{ clipPath: clipWith(INNER_CUT) }}
        >
          {children}
        </div>
      </div>

      {/* The diamond on the surround beside the cut — the same relationship it
          has on every other piece of this identity. Outside the clipped frame,
          because a clip-path would cut it in half. */}
      <span
        aria-hidden
        className="pointer-events-none absolute"
        style={{ insetInlineStart: "13cqw", top: "2.2cqw" }}
      >
        <KhatDiamond tone="accent" className="h-[3.4cqw] w-[3.4cqw] min-h-3 min-w-3" />
      </span>
    </div>
  )
}
