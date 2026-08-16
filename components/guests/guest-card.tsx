import Image from "next/image"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { KhatDiamond } from "@/components/brand/khat-icon"
import { guestCutoutUrl } from "@/lib/media/guest-cutouts"
import { cn } from "@/lib/utils"

/**
 * The guest card, in the composition the designer drew for the episode covers.
 *
 * WHAT THIS REPLACED. A centred stack — rounded photo, «ضيف الحلقة», name, role,
 * link — that looked like a generic profile card and shared nothing with the
 * artwork the show is published under. Khaled asked for the cover layout
 * instead, minus the episode title: «يكون فقط اسم ومسمى الضيف».
 *
 * EVERY NUMBER BELOW IS MEASURED OFF `غلاف الحلقة 02/thumnails vr 02.pdf`, p.3,
 * on its own 1920x1080 artboard — the vector, not a screenshot:
 *
 *   panel        the path in PANEL, verbatim from the file
 *   rule         x 891.8 w 8.2, y 401.9 h 253.6   → 46.45% / 0.43% / 37.2% / 23.5%
 *   diamond      101.8 square, centred at (1254.3, 280.4) → 5.30% wide at 65.3%/26.0%
 *   text edge    right-aligned to the rule's outer edge, 900/1920 = 46.875%
 *
 * and the three inks resolve onto the palette: the ground is Deep Indigo, the
 * panel Warm Ivory, the accents KHAT Orange. They come out of the PDF a few
 * points off (#2d2461, #f4ede7, #fe4702) because the file is CMYK; the tokens
 * are used, not the converted values.
 *
 * IT DRAWS ONE OF TWO WAYS, AND THE CUT-OUT IS THE REAL ONE.
 *
 * · **With a cut-out** (`guestCutoutUrl`, produced on-device by
 *   `scripts/cut-out-guest-photos.ts`) the card is his drawing: the guest
 *   stands on flat Deep Indigo with no frame and no edge, and the two
 *   Signature Purple arcs he drew behind the guest are here too, because now
 *   something can actually be seen behind. This is the intended state — 31 of
 *   the portraits have one.
 * · **Without one** — a guest uploaded since that script last ran — the plain
 *   photograph is bled to the edges under a gradient, and the arcs are skipped
 *   because a rectangle would cover them completely. Drawing geometry nothing
 *   can see is not fidelity.
 *
 * THE CARD HOLDS 16:9 AT EVERY WIDTH and sizes its type in `cqw`, so the
 * composition is the same drawing on a 375px phone as on a 1440px desktop
 * rather than a layout that reflows into something he never drew.
 */

/**
 * The ivory panel, verbatim from the artboard. Rendered with
 * `preserveAspectRatio="none"` inside a locked 16:9 box, so the 51.5° diagonals
 * come out at exactly the angle he drew them.
 */
const PANEL =
  "M 1155.36 403.45 L 1155.36 666.41 C 1155.36 678.27 1151.51 689.81 1144.39 699.30 " +
  "L 875.43 1057.29 C 865.09 1071.05 848.87 1079.15 831.65 1079.15 L 0 1079.15 L 0 0.20 " +
  "L 832.07 0.20 C 849.05 0.20 865.07 8.07 875.44 21.53 L 1143.98 370.03 " +
  "C 1151.36 379.61 1155.36 391.36 1155.36 403.45 Z"

/**
 * The two Signature Purple arcs, also verbatim. They are tone-on-tone — one
 * identity purple on the other, #342c6b on #362e6d — so they read as depth
 * rather than as shapes, which is why they can sit behind a face without
 * competing with it.
 */
const ARC_LOWER =
  "M 1688.34 667.42 L 1688.34 784.42 L 1407.88 784.42 C 1370.72 784.42 1335.69 798.32 " +
  "1308.72 823.62 L 1129.31 1080 L 986.51 1080 L 1218.98 747.80 L 1222.60 744.17 " +
  "C 1247.06 719.71 1275.66 700.60 1307.61 687.37 C 1339.56 674.14 1373.30 667.42 1407.88 667.42 Z"
const ARC_UPPER =
  "M 1920 435.21 L 1920 533.21 L 1789.39 533.21 C 1750.39 533.21 1713.73 518.03 " +
  "1686.16 490.46 L 1513.58 317.87 C 1486.01 290.30 1470.82 253.64 1470.82 214.64 " +
  "L 1470.82 0 L 1568.82 0 L 1568.82 214.64 C 1568.82 227.46 1573.82 239.51 1582.87 248.57 " +
  "L 1755.46 421.16 C 1764.53 430.21 1776.57 435.21 1789.39 435.21 Z"

export interface GuestCardProps {
  guest: {
    name: string
    slug?: string | null
    /** Doubles as the role line — «خطاط سوري». There is no separate field. */
    bio?: string | null
    photo_url?: string | null
  }
  /** The label above the name. Says what this guest is on THIS page. */
  eyebrow?: string
  /**
   * The call to action at the bottom. `null` on the guest's own page — there is
   * nowhere further to go, and a link that returns you to where you already are
   * is the kind of dead control this codebase keeps finding.
   */
  action?: string | null
  /**
   * The heading level for the name. The guest's own page needs `h1`; anywhere
   * the card is one item among many needs `h2`/`h3`, or the document outline
   * claims a list of headlines.
   */
  as?: "h1" | "h2" | "h3"
  className?: string
}

export function GuestCard({
  guest,
  eyebrow = "ضيف الحلقة",
  action = "شوف الملف الكامل",
  as: Heading = "h2",
  className,
}: GuestCardProps) {
  const cutout = guestCutoutUrl(guest.photo_url)
  const href = guest.slug ? `/guests/${encodeURIComponent(guest.slug)}` : null

  const shell = cn(
    "@container group relative block aspect-[16/9] overflow-hidden rounded-2xl bg-primary",
    href && "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2",
    className,
  )

  // A card that leads nowhere is a `<div>`, not an `<a href="#">` — the guest's
  // own page has no further page to send anyone to. The drawing is built once
  // and handed to whichever wrapper applies; defining the wrapper as a
  // component here would remount the whole card on every render.
  const art = (
    <>
      {/* THE ARCS ARE GROUND, so they are drawn unless something would bury
          them: a cut-out stands in front of them, and no photo at all leaves
          them the whole indigo to themselves. The one case they are skipped is
          the rectangular fallback, which covers them completely. */}
      {cutout || !guest.photo_url ? (
        <svg
          viewBox="0 0 1920 1080"
          preserveAspectRatio="none"
          aria-hidden
          focusable="false"
          className="absolute inset-0 h-full w-full"
        >
          <path d={ARC_UPPER} fill="#342c6b" />
          <path d={ARC_LOWER} fill="#342c6b" />
        </svg>
      ) : null}

      {cutout ? (
        // THE PHOTO IS THE RIGHT SIDE OF THE CARD, bleeding to the top, the
        // outer edge and the bottom — his drawing, sent 2026-08-16.
        //
        // It was a 44%-wide box holding a `contain` image, so the cut-out
        // floated with indigo on three sides: measured, a 343px panel around a
        // 151px picture, 192px of it bare. Khaled circled that gap four times.
        // The panel was never meant to show AROUND the guest — in his card the
        // guest fills it and the ivory shape with the 45° cut lies OVER the
        // picture from the left.
        //
        // `cover`, not `contain`: the box must be FULL, and the crop it costs
        // comes off the sides and the headroom, never off the shoulders —
        // `object-bottom` pins the feet of the image to the card's floor.
        // `-bottom-px`: a sub-pixel row of the indigo panel was showing under the
        // photo at some widths — the card rounds its corners and the image box
        // landed exactly on the boundary. Overrunning by one pixel removes the
        // line without moving the picture, and `overflow-hidden` on the card
        // clips the overrun.
        <div className="absolute -bottom-px top-0 start-0 w-[58%]">
          <Image
            src={cutout}
            alt=""
            fill
            sizes="(max-width: 768px) 44vw, 330px"
            // `object-contain object-bottom`, and the fix that made it work is
            // in the FILE, not here.
            //
            // Khaled circled the indigo showing under and beside the guest and
            // said: only the bottom, never the head. `cover` fills the panel but
            // pays for it by cropping the top of the head — he rejected that on
            // sight. The gap was never really about the fit: every cut-out
            // carried a 32px transparent margin from Vision, so `object-bottom`
            // was anchoring the guest to the bottom of his OWN PADDING, which
            // sat 32px above the frame. `scripts/trim-guest-cutouts.ts` removes
            // that margin on the left, right and bottom — the top is untouched,
            // so the head is exactly as it was — and the clothing now lands on
            // the frame's edge because it IS the edge of the image.
            className="object-cover object-[50%_82%] transition-transform duration-500 group-hover:scale-[1.03]"
          />
        </div>
      ) : guest.photo_url ? (
        // Fallback for a portrait that has not been cut out yet. Starts at 42%
        // so the face lands in the part the panel does not cover; `object-top`
        // because a portrait cropped to 16:9 loses the chin, never the eyes.
        <div className="absolute inset-y-0 start-0 w-[55%]">
          <Image
            src={guest.photo_url}
            alt=""
            fill
            sizes="(max-width: 768px) 55vw, 420px"
            className="object-cover object-top transition-transform duration-500 group-hover:scale-[1.03]"
          />
          <div
            aria-hidden
            className="absolute inset-0"
            style={{
              // The stops are set by where the diamond lands, not by taste.
              // It occupies 58.2%–67.8% along this axis (its 62.7%–68% of the
              // card, mapped into a photo that runs 45%–100%), and on his
              // artboard it sits on flat ground. Reaching full Deep Indigo by
              // 88% puts most of that ground back without eating into the face.
              backgroundImage:
                "linear-gradient(to var(--khat-fade-to, left), transparent 45%, hsl(var(--primary)) 88%)",
            }}
          />
        </div>
      ) : null}

      <svg
        viewBox="0 0 1920 1080"
        preserveAspectRatio="none"
        aria-hidden
        focusable="false"
        className="absolute inset-0 h-full w-full"
      >
        {/* SOFT BLUSH, NOT THE WARM IVORY HE FILLED IT WITH — and that is the
            relationship, not a substitution. On his artboard the panel is the
            light thing on a dark ground, so Warm Ivory reads as a panel. On the
            episode page the ground IS Warm Ivory: filling it with the same
            value made the card's left half dissolve into the page, and the
            composition read as loose text with an indigo shape beside it.
            Soft Blush is the value every other card on this site sits on, and
            it restores the figure/ground his drawing depends on. */}
        <path d={PANEL} fill="hsl(var(--card))" />
      </svg>

      {/* 5.30% of the width — his size. NOT his position.

          On the artboard it sits at 65.3% / 26.0%, on bare indigo beside the
          panel's point, because his cut-out is a half-body shot that starts
          lower down. Ours are square head-and-shoulders crops fitted to a
          44%-wide box, so the portrait's top edge lands at y=235 of 1080 and
          the diamond landed on the guest's head. Khaled: «ما ابي النقطه
          البرتقاليه تتداخل مع صورة الضيف».

          It moves into the wedge ABOVE the portrait instead: y 90–192, which is
          clear of the image's top edge at 235 for every guest — the box and the
          fit are the same for all of them, so this is a property of the layout,
          not of one photo. Its left edge at x=1010 clears the panel's diagonal,
          which is at x=986 at that height. Same relationship he drew: the
          diamond on the ground, just outside the panel. */}
      <span
        aria-hidden
        className="absolute block"
        style={{ insetInlineStart: "42.08%", top: "8.33%" }}
      >
        <KhatDiamond tone="accent" className="h-[5.3cqw] w-[5.3cqw]" />
      </span>

      {/* Right-aligned to the rule's outer edge: 900/1920. */}
      <div
        className="absolute top-1/2 flex -translate-y-1/2 flex-col text-start"
        style={{ insetInlineStart: "53.125%", insetInlineEnd: "5%" }}
      >
        {/* EVERY SIZE HAS A PIXEL FLOOR. `cqw` alone reproduces his proportions
            at any width, which is the point — but the card is 343px wide on a
            375px phone, and 2.6cqw of that is 8.9px. Measured, not guessed: the
            first build of this shipped an eyebrow at 8.9px and a role line at
            9.9px, both unreadable. `max()` keeps the drawing proportional
            wherever there is room and legible where there is not. */}
        <p className="text-[max(11px,2.6cqw)] font-bold leading-none text-accent-strong">
          {eyebrow}
        </p>

        <div className="mt-[max(8px,2.2cqw)] border-s-[max(2px,0.43cqw)] border-accent ps-[max(9px,2.4cqw)]">
          <Heading className="line-clamp-2 text-balance text-[max(20px,6cqw)] font-bold leading-[1.15] text-foreground">
            {guest.name}
          </Heading>
          {guest.bio ? (
            <p className="mt-[max(4px,1.2cqw)] line-clamp-2 text-[max(11px,2.9cqw)] leading-snug text-muted-foreground">
              {guest.bio}
            </p>
          ) : null}
        </div>

        {action ? (
          <span className="mt-[max(9px,2.4cqw)] inline-flex items-center gap-[max(4px,1cqw)] text-[max(11px,2.4cqw)] font-medium text-primary transition-colors group-hover:text-accent-strong">
            {action}
            <ArrowLeft className="h-[max(11px,2.4cqw)] w-[max(11px,2.4cqw)]" aria-hidden />
          </span>
        ) : null}
      </div>
    </>
  )

  return href ? (
    <Link href={href} aria-label={`${guest.name} — الملف الكامل`} className={shell}>
      {art}
    </Link>
  ) : (
    <div className={shell}>{art}</div>
  )
}
