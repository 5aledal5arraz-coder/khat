import Image from "next/image"

import type { TrustedPartner } from "@/lib/queries/partnerships"

/**
 * «شركاء الموسم» — the partner logo band.
 *
 * ── WHY THIS FILE EXISTS ───────────────────────────────────────────────────
 * Everything it needs was already built and none of it reached a visitor. The
 * `trusted_partners` table has `logo_url`, `website_url`, `display_order` AND a
 * `show_on_homepage` flag; `getHomepagePartners()` filters on that flag;
 * `getCachedHomepagePartners` wraps it with a cache tag. The chain ended there
 * — zero callers outside its own definition — so an admin could tick «اعرضه في
 * الصفحة الرئيسية» and nothing anywhere would change, and nothing would say so.
 * Same shape as the other silent features in this codebase: built, wired, never
 * rendered.
 *
 * ── THE TREATMENT, AND THE PROBLEM IT SOLVES ───────────────────────────────
 * A sponsor's logo is their trademark, in their colours — which is the one kind
 * of colour this site cannot simply adopt, and also the one kind it must not
 * repaint. Four or five foreign palettes in a row would be the loudest band on
 * a page whose whole identity is restraint.
 *
 * So the band renders each logo as `mix-blend-mode: multiply` + `grayscale(1)`
 * on the Soft Blush ground, and drops both on hover/focus. That pairing is
 * doing three jobs at once, and the middle one is the reason it beats a plain
 * `filter`:
 *
 *   1. grayscale removes the foreign hue, so the row reads as one material.
 *   2. multiply makes WHITE TRANSPARENT against the ground. Logos arrive as
 *      often on an opaque white JPEG as on a transparent PNG, and a white tile
 *      on blush is a visible box around one sponsor and not the others. A
 *      CSS mask would have solved the colour but turned that same white
 *      rectangle into a solid indigo slab — worse, and silently so.
 *   3. multiplying grey against a WARM ground tints it warm, so the logos sit
 *      inside the palette instead of reading as cold neutral grey on cream.
 *
 * Hover/focus restores the real logo. That is the sponsor's due, it is one
 * pointer away, and on touch — where there is no hover — the monochrome state
 * is the resting state, which is the correct default anyway.
 *
 * ── WHAT IT DELIBERATELY DOES NOT DO ───────────────────────────────────────
 * No season↔sponsor table. Seasons are not modelled as rows at all — they are
 * `episode_categories` in the خط lane, and `episodes.season` is NULL on all 42
 * rows — so a `season_sponsors` foreign key would have nothing to point at.
 * The band is driven by `show_on_homepage`, and the same set shows on the home
 * page and on a season page. When seasons become real rows, this takes a
 * `partners` prop from a different query and nothing else here moves.
 */
export function SponsorStrip({
  partners,
  heading = "شركاء الموسم",
  className,
}: {
  partners: TrustedPartner[]
  /** «شركاء الموسم» on the home page; a season page may name its own season. */
  heading?: string
  className?: string
}) {
  // An empty band is worse than no band: it announces a slot nobody filled.
  if (!partners.length) return null

  return (
    <section className={className} aria-labelledby="sponsor-strip-heading">
      <div className="mx-auto max-w-6xl px-6">
        {/* ── THE HEADING, WITH THE BRAND'S OWN RULE OVER IT ────────────────
            Khaled: «الخط صغير ولوقو الشريك صغير جدا، شوف طريقه افضل لابراز
            الشركاء». Measured before this change: the heading was 14px and the
            logo rendered 44px tall inside a 195px card — 23% of it. A partner
            paying for the homepage was the quietest thing on it.

            Prominence here is bought with SIZE, SPACE AND STRUCTURE, not with
            colour. That is the rule Khaled set an hour earlier and it applies
            exactly: the palette does not move, the type scale does. The short
            KHAT Orange rule is the same gesture the hero uses under the
            headline, so the section reads as part of the brand rather than as
            a bolted-on ad slot. */}
        <div className="flex flex-col items-center">
          <span aria-hidden="true" className="block h-[3px] w-14 rounded-full bg-accent" />
          <h2
            id="sponsor-strip-heading"
            className="mt-5 text-center text-subhead font-bold text-foreground"
          >
            {heading}
          </h2>
        </div>

        {/* Each partner is an OBJECT, not an item in a row. A bordered tile
            gives the logo a field of its own and a floor to sit on, which is
            most of why the old bare row read as small — 44px of artwork adrift
            in 195px of card had nothing to be big relative to.

            `flex-wrap` + a fixed tile width rather than a grid: with one
            partner a grid leaves a lone cell hugging the start edge, and this
            table is empty far more often than it is full. Wrapping centres 1,
            2, 3 or 7 equally well. */}
        <ul className="mt-10 flex flex-wrap items-stretch justify-center gap-4 sm:gap-5">
          {partners.map((p) => (
            <li
              key={p.id}
              /* THE TILE WIDTH FOLLOWS THE COUNT, because one rule cannot serve
                 both ends. At full width a single partner is a proper feature;
                 at full width SIX partners are six screens of scrolling on a
                 phone. React knows the count, so the breakpoint does not have
                 to guess: one or two go wide, three or more pair up on mobile
                 and sit four to a row on a desktop. */
              className={
                partners.length <= 2
                  ? "w-full max-w-[320px] sm:w-[280px]"
                  : "w-[calc(50%-0.5rem)] max-w-[320px] sm:w-[260px]"
              }
            >
              <SponsorTile partner={p} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

/**
 * One partner, as a tile. A link when there is a site to link to, a plain
 * figure otherwise — an `<a>` with no `href` is not focusable and reads as a
 * link to a screen reader that then goes nowhere.
 *
 * The NAME is printed under the logo. It was not before, and a wordless mark
 * asks the reader to already know the brand; the alt text carried it only for
 * screen readers. It also keeps a partner with no artwork from looking like a
 * different kind of row.
 */
function SponsorTile({ partner }: { partner: TrustedPartner }) {
  const body = (
    <>
      <div className="flex h-20 w-full items-center justify-center sm:h-24">
        {partner.logo_url ? (
          <Image
            src={partner.logo_url}
            alt=""
            width={280}
            height={112}
            /* WAS `h-9 … sm:h-11` — 36/44px. The logo now fills the tile's
               own band: 64px, 80px from `sm`, roughly double, and it has a
               box to be large inside instead of floating in a wide card.
               `alt=""` because the name is printed right below it; two copies
               of the same word is noise for a screen reader.
               The blend and greyscale live on the image so they cannot touch
               the focus ring on the wrapper. */
            className="max-h-16 w-auto max-w-full object-contain opacity-90 mix-blend-multiply grayscale transition duration-300 group-hover:opacity-100 group-hover:grayscale-0 group-focus-visible:opacity-100 group-focus-visible:grayscale-0 sm:max-h-20"
          />
        ) : (
          /* No artwork — the name becomes the mark, at display size so the
             tile does not collapse into an empty box. */
          <span className="px-3 text-center text-subhead font-bold text-foreground">
            {partner.name}
          </span>
        )}
      </div>
      {partner.logo_url ? (
        <span className="mt-4 block text-center text-caption font-semibold text-foreground">
          {partner.name}
        </span>
      ) : null}
    </>
  )

  const tile =
    "group flex h-full flex-col justify-center rounded-2xl border border-border bg-card px-5 py-7 transition-shadow"

  if (!partner.website_url) {
    return <div className={tile}>{body}</div>
  }

  return (
    <a
      href={partner.website_url}
      target="_blank"
      rel="noopener noreferrer sponsored"
      className={`${tile} outline-none hover:shadow-md focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background`}
    >
      {body}
    </a>
  )
}
