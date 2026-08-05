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
        <div className="rounded-2xl border border-border/70 bg-card px-6 py-10 sm:px-10">
          <h2
            id="sponsor-strip-heading"
            className="text-center text-micro font-semibold uppercase tracking-[0.2em] text-muted-foreground"
          >
            {heading}
          </h2>

          <ul className="mt-8 flex flex-wrap items-center justify-center gap-x-10 gap-y-8 sm:gap-x-14">
            {partners.map((p) => (
              <li key={p.id}>
                <SponsorLogo partner={p} />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}

/**
 * One logo. A link when there is a site to link to, a plain figure otherwise —
 * an `<a>` with no `href` is not focusable and reads as a link to a screen
 * reader that then goes nowhere.
 */
function SponsorLogo({ partner }: { partner: TrustedPartner }) {
  const inner = partner.logo_url ? (
    <Image
      src={partner.logo_url}
      alt={partner.name}
      width={180}
      height={56}
      /* `mix-blend-mode` and the greyscale both live here so they apply to the
         image and not to the focus ring on the wrapper. */
      className="h-9 w-auto max-w-[150px] object-contain opacity-80 mix-blend-multiply grayscale transition duration-300 group-hover:opacity-100 group-hover:grayscale-0 group-focus-visible:opacity-100 group-focus-visible:grayscale-0 sm:h-11 sm:max-w-[180px]"
    />
  ) : (
    /* No logo file — the name is the mark. Dusty Violet, lifting to the ink on
       hover, so a partner without artwork still reads as a partner and not as a
       broken image. */
    <span className="text-caption font-semibold text-muted-foreground transition-colors group-hover:text-foreground group-focus-visible:text-foreground">
      {partner.name}
    </span>
  )

  if (!partner.website_url) {
    return (
      <span className="group inline-flex items-center" title={partner.name}>
        {inner}
      </span>
    )
  }

  return (
    <a
      href={partner.website_url}
      target="_blank"
      rel="noopener noreferrer sponsored"
      title={partner.name}
      className="group inline-flex items-center rounded-md outline-none ring-offset-4 ring-offset-card focus-visible:ring-2 focus-visible:ring-primary"
    >
      {inner}
    </a>
  )
}
