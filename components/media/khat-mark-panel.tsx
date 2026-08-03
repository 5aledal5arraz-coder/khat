import { cn } from "@/lib/utils"

/**
 * The one empty state for every image slot on the public site.
 *
 * WHAT IT SAYS. A flat `bg-secondary` panel carrying the letter «ط» at
 * `text-primary/25` — deliberately quiet, deliberately IDENTICAL for every
 * subject. It reads «no image has arrived yet», which is true. The thing it
 * replaced — two Arabic initials on a gradient with a ring and a glow — read
 * «this is his identity», which was false: `guestInitials` returned «ا» as the
 * second letter for 5 of our 7 real names, because Arabic family names begin
 * with «ال» (الحارث المزيدي → «اا»). Deriving a per-subject colour or pattern
 * from the name has the same defect one level up: it implies a meaning the
 * data does not carry.
 *
 * WHY «ط» AND NOT THE ARTWORK. The brand marks in `components/brand` are the
 * official vector and may not be recoloured (`khat-logo.tsx`), so they cannot
 * be tinted down to a 25% watermark. This is a typographic letter, not a
 * wordmark: it is one glyph, it never sits next to «بودكاست», and it is not a
 * substitute for the lockup — which is why the brand guards in `tests/brand`
 * are untouched by it.
 *
 * `aria-hidden`: the accessible name always lives on the surrounding link or
 * heading, never on the placeholder — a screen reader hearing «ط» learns
 * nothing.
 */
export function KhatMarkPanel({
  className,
  markClassName,
}: {
  className?: string
  /** Glyph size. Callers pass a step off the type scale — see call sites. */
  markClassName?: string
}) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "flex h-full w-full items-center justify-center bg-secondary",
        className,
      )}
    >
      <span
        className={cn(
          "font-bold leading-none text-primary/25",
          markClassName ?? "text-heading",
        )}
      >
        ط
      </span>
    </div>
  )
}
