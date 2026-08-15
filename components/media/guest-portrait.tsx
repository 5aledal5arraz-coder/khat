"use client"

import Image from "next/image"
import { useState } from "react"
import { cn } from "@/lib/utils"
import { KhatMarkPanel } from "./khat-mark-panel"

/**
 * The three sizes a PERSON's face is shown at, and nothing else.
 *
 * Named for its first and main subject, but the rule it carries — no initials,
 * no derived colour, a rounded square — is about faces, not about guests. The
 * team cards on `/about` were the counter-example that proved it: left outside
 * this component they grew their own circle and their own initial.
 *
 * A ROUNDED SQUARE, NOT A CIRCLE — and the reason is in the artwork, not in
 * taste. The KHAT wordmark is built from parallelograms with straight edges
 * (see the path data in `components/brand/khat-logo-art.ts`), so a circle
 * contradicts the one shape the identity owns. It is also the cheapest
 * differentiator we have: essentially every podcast on earth puts its guests
 * in circles.
 *
 * `sizes` is exact rather than a viewport expression because every variant is a
 * fixed box at every breakpoint.
 *
 * THE CORNERS ARE ON THE SWITCH POINT. Both of these were `rounded-[20px]` — an
 * arbitrary literal that `--radius` cannot move, on the one component that
 * draws a person's face at three sizes. globals.css states the policy (every
 * corner a multiple of `--radius`, so one number moves the whole identity) and
 * names the five arbitrary corners it knowingly left behind; `rounded-[20px]`
 * was a SIXTH, added after that list was written and never added to it. Two
 * rungs, not one, because the boxes differ by 2x: 200px takes `rounded-3xl`
 * (3x = 24px) and 96px takes `rounded-2xl` (2x = 16px), which is also what the
 * 80px `card` already used.
 */
/**
 * ONE VARIANT, AND IT IS NO LONGER A GUEST'S.
 *
 * There were three — `card` (the guests list), `page` (a guest's own header)
 * and `episode` (the guest block). All three guest surfaces now draw
 * `<GuestCard>`, the episode-cover composition, so the only caller left is the
 * team on `/about`, which asks for `page`. `card` and `episode` are deleted
 * rather than kept "in case": an unused variant is a second answer to a
 * question that now has one.
 *
 * The component keeps its name and its rules — no initials, no derived colour,
 * a rounded square and not a circle — because those are about faces, and
 * `/about` still has faces.
 */
const VARIANTS = {
  /** The team card on `/about`. */
  page: { box: "h-[200px] w-[200px] rounded-3xl", sizes: "200px", mark: "text-title" },
} as const

export type GuestPortraitVariant = keyof typeof VARIANTS

/**
 * A guest's photo at one of three fixed sizes — or the shared empty panel.
 *
 * WHAT IT DOES NOT DO, deliberately:
 *  · **No initials.** `guestInitials` was deleted with this component's
 *    predecessor. The mechanism did not work in Arabic: family names begin with
 *    «ال», so 5 of our 7 real names produced «ا» as the second letter, and
 *    «الدكتور الحارث المزيدي» rendered «اا» live on the site.
 *  · **No per-guest colour or pattern.** A hue derived from a name looks like
 *    information and is not.
 *  · **No ring, no glow, no gradient.** They dressed the empty state up as a
 *    finished one.
 *
 * Callers that would rather show nothing than show the empty panel — the guest
 * page and the episode page, where the name is the hero — simply do not render
 * this component. That conditional is left at the call site on purpose so the
 * page reads honestly instead of hiding the rule in here.
 */
export function GuestPortrait({
  name,
  photoUrl,
  variant,
  className,
}: {
  name: string
  photoUrl?: string | null
  variant: GuestPortraitVariant
  className?: string
}) {
  const { box, sizes, mark } = VARIANTS[variant]
  const [failed, setFailed] = useState(false)
  const showPhoto = Boolean(photoUrl) && !failed

  return (
    <div className={cn("relative shrink-0 overflow-hidden", box, className)}>
      {showPhoto ? (
        <Image
          src={photoUrl as string}
          alt={name}
          fill
          sizes={sizes}
          onError={() => setFailed(true)}
          className="object-cover"
        />
      ) : (
        <KhatMarkPanel markClassName={mark} />
      )}
    </div>
  )
}
