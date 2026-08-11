import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, Play, Sparkles } from "lucide-react"
import {
  getCachedActiveTeaser,
  getCachedHomepagePartners,
  getCachedHomepageThinkers,
  getCachedPublicEpisodes,
} from "@/lib/cache"
import type { Episode } from "@/types/database"
import type { TrustedPartner } from "@/lib/queries/partnerships"
import { TeaserSection } from "@/components/teaser/teaser-section"
import { EpisodePosterCard } from "@/components/episodes/episode-poster-card"
import { EpisodeThumb } from "@/components/media/episode-thumb"
import { filterLane } from "@/lib/episodes/programs"
import { NewsletterSignup } from "@/components/forms/newsletter-signup"
import { SponsorStrip } from "@/components/sponsors/sponsor-strip"
import { GuestStrip } from "@/components/home/guest-strip"
import {
  displayEpisodeTitle,
  episodeBlurb,
  episodeDurationLabel,
  formatArabicDate,
} from "@/lib/shared/formatters"
import { resolveDefaultOgImage } from "@/lib/seo/og"
import { getHomepageEpisodeSelection } from "@/lib/queries/homepage-episodes"
import { HOMEPAGE_EPISODE_CAP } from "@/lib/homepage/hall"
import {
  BRAND_DESCRIPTION,
  BRAND_HEADLINE_ACCENT,
  BRAND_HEADLINE_LEAD,
  BRAND_HEADLINE_REST_BEFORE,
  BRAND_SUBHEAD,
} from "@/lib/brand/voice"

// `images` must be stated explicitly, NOT deleted: a page-level `openGraph`
// replaces the root layout's block instead of merging into it, so dropping the
// key would leave the homepage with no og:image at all. It resolves to the same
// default the layout uses, so og:image and twitter:image agree — the hardcoded
// /logo-wide.jpg (2560x424, 6:1) disagreed with the inherited twitter:image and
// was cropped hard on a 1.91:1 card.
export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "خط | بودكاست",
    description:
      BRAND_DESCRIPTION,
    alternates: { canonical: "https://khatpodcast.com" },
    openGraph: {
      title: "خط | بودكاست",
      description: BRAND_DESCRIPTION,
      url: "https://khatpodcast.com",
      type: "website",
      locale: "ar_SA",
      siteName: "خط",
      images: [await resolveDefaultOgImage()],
    },
  }
}

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://khatpodcast.com/#organization",
      name: "خط",
      alternateName: "Khat Podcast",
      url: "https://khatpodcast.com",
      // /logo.png is the RETIRED gold wordmark. This is the current horizontal
      // lockup, rasterised at 1200x287 by scripts/build-brand-icons.ts —
      // structured-data consumers want real pixel dimensions, which an SVG
      // cannot state.
      logo: "https://khatpodcast.com/brand/khat-lockup-horizontal.png",
      // THESE WERE THE WRONG ACCOUNTS. `instagram.com/khatpodcast` and
      // `twitter.com/khatpodcast` are not KHAT's — the real handles carry a dot
      // and an underscore. This block is what tells Google which profiles are
      // officially the show's, so it was pointing the knowledge panel at two
      // strangers. Resolved from the links in the episode descriptions, same
      // source as `podcast_platform_links` (scripts/seed-khat-social-links.ts);
      // if one changes, change both.
      sameAs: [
        "https://www.youtube.com/@KhatPodcast",
        "https://www.instagram.com/Khat.Podcast",
        "https://x.com/Khat_Podcast",
        "https://www.tiktok.com/@khatpodcast",
        "https://www.threads.com/@khat.podcast",
        // The audio platforms, added 2026-08-05 once real URLs existed. Every
        // one is verified — see scripts/set-official-audio-platforms.ts, which
        // refuses to write a URL that does not resolve. `sameAs` is how a
        // knowledge panel learns these profiles are the same show, so a wrong
        // entry here points Google at a stranger, which is exactly what the
        // Instagram and X lines above were doing before they were fixed.
        "https://podcasts.apple.com/us/podcast/khatpodcast/id1701324741",
        "https://open.spotify.com/show/6DVDvDO6oCdNTG0snPlpGn",
      ],
    },
    {
      "@type": "PodcastSeries",
      "@id": "https://khatpodcast.com/#podcast",
      name: "خط",
      url: "https://khatpodcast.com",
      inLanguage: "ar",
      // `webFeed` is the property schema.org defines for a PodcastSeries, and
      // it was missing — so nothing on this site declared that KHAT has a feed
      // at all. Khaled supplied it on 2026-08-05; it is the host's own RSS.com
      // feed, checked: 19 items, every one with an audio enclosure.
      webFeed: "https://media.rss.com/khatpodcast/feed.xml",
      description:
        BRAND_DESCRIPTION,
    },
  ],
}

export default async function HomePage() {
  const [episodes, activeTeaser, partners, thinkers] = await Promise.all([
    getCachedPublicEpisodes().catch(() => [] as Episode[]),
    getCachedActiveTeaser().catch(() => null),
    // Same `.catch(() => [])` as its neighbours: a partner band is the least
    // important thing on this page, and it must never be the reason the
    // homepage 500s.
    getCachedHomepagePartners().catch(() => [] as TrustedPartner[]),
    // «معرض العقول». Returns null when nothing is configured AND no guest has
    // an episode — the section then renders nothing at all, no empty frame.
    getCachedHomepageThinkers().catch(() => null),
  ])
  // حلقات خط ONLY — the lane, not "everything that is not a clip".
  //
  // `mainFeed()` drops the six «مقاطع خط» cut-downs, which is what this needed
  // when clips were the only other kind of row. They are not: «سالفة» is a
  // separate programme, and the badge on a homepage card reads «موسم من خط», so
  // one سالفة row reaching this grid is the homepage stating that a different
  // show is a season of ours.
  //
  // TODAY'S MEASURED IMPACT IS ZERO — 7/7 خط — AND THAT IS NOT A DEFENCE. The
  // reason it holds is not that سالفة is too old to make the newest seven: this
  // list is `getCachedPublicEpisodes()` UNSORTED, and the proof is on the next
  // page over — /episodes sorts it by date and leads with a row this page never
  // shows. Nothing orders the homepage feed, so nothing keeps سالفة out of it;
  // the current result is an accident of insertion order that any re-fetch,
  // re-sort or re-index can end. `filterLane` is the rule that was meant.
  const conversations = filterLane(episodes, "khat")
  const featured = conversations[0] ?? null
  const season = currentKhatSeason(episodes)
  const featuredBlurb = featured ? episodeBlurb(featured) : null

  // «قاعة الحلقات» — the grid is no longer a hardcoded `slice(1, 7)`. It is
  // whatever /admin/home-content has been configured to show: a filter in auto
  // mode (newest · most-viewed · one programme · one topic) or a hand-picked
  // list in manual mode. The heading travels with it, so the page cannot label
  // a list of invasion episodes «أحدث الحلقات». The hero is passed in to be
  // excluded — it is printed full-width directly above.
  const hall = await getHomepageEpisodeSelection({
    exclude: featured?.id ?? null,
    episodes,
  }).catch(() => null)
  const grid = hall?.episodes ?? conversations.slice(1, 1 + HOMEPAGE_EPISODE_CAP)
  const gridLabel = hall?.label ?? "أحدث الحلقات"
  const moreHref = hall?.moreHref ?? "/episodes"
  const hiddenCount = Math.max(0, (hall?.total ?? conversations.length) - grid.length)
  // NOBODY APPEARS TWICE ON THIS PAGE.
  //
  // Auto mode picks "the guests of the newest episodes", and the grid beside
  // them renders those same newest episodes — so «معرض العقول» was structurally
  // guaranteed to repeat itself. It shipped that way: 3 of 3 guest cards on
  // production named someone already on screen. Three cards, zero new people,
  // and the whole point of the section gone.
  //
  // The query now returns a bench of up to 12; this takes the first three who
  // are NOT already visible as the hero or in the grid.
  const shownGuestIds = new Set(
    [featured, ...grid]
      .map((e) => e?.guest?.id ?? e?.guest_id ?? null)
      .filter((id): id is string => Boolean(id)),
  )
  // The strip is a row of PEOPLE, not three cards squeezed between posters, so
  // the old `.slice(0, 3)` cap is gone — it existed only because the interleave
  // had exactly three guest cells to fill. What stays is the de-duplication
  // above: a «قريباً» guest is always shown (they have no episode to repeat),
  // and the rest drop out when their face is already the hero or in the grid.
  const stripGuests = (thinkers ?? []).filter((t) => t.isUpcoming || !shownGuestIds.has(t.id))

  return (
    <div className="overflow-hidden">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* ───────────────────────── Hero ───────────────────────── */}
      <section className="relative isolate flex min-h-[88vh] items-center justify-center px-6 text-center">
        {/* ── Ambient brand light ───────────────────────────────────────
            THESE TWO GLOWS WERE THE WRONG ORANGE AND THE WRONG INDIGO, and
            Khaled caught it by eye on 2026-08-05. They were written as literal
            `hsl(22 90% 53%)` and `hsl(252 48% 40%)` — rendering #F36A1B and
            #493597, neither of which is in «ملف عرض الشعار». They are the same
            invented values the OG-image generator had already been cleaned of;
            they survived here because MY EARLIER PALETTE SWEEP READ `color`,
            `background-color` AND `border-color` — AND NOT `background-image`.
            A gradient was invisible to the check that declared the page clean.

            Now written as the tokens, not as hexes: the glow follows
            `--primary` and `--accent`, so it cannot drift from the palette
            again and a future identity change carries it automatically. */}
        <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          {/* `start-1/2` is logical (right:50% in RTL) but translate is
              physical, so the negative form shifted the glow a full 42rem to
              the left instead of centering it — invisible below ~700px. */}
          <div className="absolute start-1/2 top-[-10%] h-[42rem] w-[42rem] translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,hsl(var(--primary)/0.14),transparent)]" />
          <div className="absolute end-[12%] top-[22%] h-72 w-72 rounded-full bg-[radial-gradient(closest-side,hsl(var(--accent)/0.14),transparent)]" />
        </div>

        {/* NO WATERMARK HERE. The KHAT secondary mark sat behind this block at
            5.5% to fill the 38.6% of empty hero — Khaled asked for it, saw it,
            and removed it on 2026-08-05. The emptiness was never the problem it
            was solving: the orange rule below now sits under the whole headline
            rather than inside it, which is what the block needed. Do not put a
            background mark back without asking him. */}

        <div className="mx-auto max-w-4xl">
          {/* THE NAME BELOW lg, THE SEASON ALWAYS — both arguments were right,
              they were just measured at different widths.
              · Below 1024 the header renders `khat-mark.svg` alone (44.87×32,
                no wordmark), so this badge is the only place «بودكاست خط» is
                spelled on the first screen. That is most of the traffic, and it
                is why the badge survives at all.
              · At 1024 and up the header swaps to `khat-lockup-horizontal.svg`
                — measured 183.8×44 — and the lockup DRAWS the name, in both
                scripts, as artwork. Printing it again 150px below is the name
                twice on one screen, which is the very thing this wave removed
                from five other surfaces.
              1024 is not a guess and not a copy: `HEADER_LOGO.breakpoint` is
              the single place that swap is declared (components/layout/
              header.tsx), and `lg:` IS 1024px in this Tailwind config. If that
              constant moves, this must move with it — it is the same decision.
              The season is the information either way. The h1 right below
              already carries the brand line, so a badge repeating the promise
              says nothing twice; what a first-time visitor cannot know
              from anything else on this screen is WHICH SEASON the archive is
              on. It is derived, never typed: `currentKhatSeason()` reads the
              newest خط episode's own category, so season two names itself here
              the day its first episode publishes.
              NO SEASON RESOLVED ⇒ THE NAME AT EVERY WIDTH. Hiding it above lg
              with nothing to replace it would leave a bordered pill containing
              one decorative icon — a control-shaped object that says nothing. */}
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-1.5 text-micro font-semibold text-muted-foreground shadow-sm">
            <Sparkles className="h-3.5 w-3.5 text-accent" />
            <span className={season ? "lg:hidden" : undefined}>بودكاست خط</span>
            {season ? (
              <>
                {/* The separator belongs to the name, not to the season: above
                    lg the name is gone and a leading «·» would be punctuation
                    hanging off nothing. */}
                <span aria-hidden="true" className="text-border lg:hidden">
                  ·
                </span>
                <span className="text-foreground">{season}</span>
              </>
            ) : null}
          </span>

          {/* The mark is a khaa with a line under it, so the headline draws the
              line it names. The rule is decorative, not text: the orange clears
              SC 1.4.11 (3:1) on the page ground, which is the bar a non-text
              mark has to meet — the WORDS stay --foreground.

              THE WORD IS DRAWN, NOT SET. The sentence describes underlining
              something, so the last word is left as the line itself and the
              reader closes it — «تضع تحتها ___» is idiomatic enough in Arabic
              that the mind supplies «خطًّا» before it notices it was asked to.
              The word is still HERE, `sr-only` rather than deleted: a screen
              reader gets the whole sentence, `BRAND_DESCRIPTION` carries it
              into the metadata, and the pun costs a blind visitor nothing.

              THE RULE MOVED OUT OF THE SENTENCE, 2026-08-05. It used to be an
              inline span sitting where «خطًّا» would have been — on the
              baseline, at the end of line two, 1.45em long. Khaled asked for it
              below the text, and he is right for a reason the inline version
              could not satisfy: the line the brand names is one you put UNDER a
              phrase, not one you put after it. Inline, it read as a redaction
              bar mid-sentence; under the block, it is the gesture the name
              describes, and it does the job the watermark was added for.

              It lives OUTSIDE the <h1>: it is not a word, and an empty span
              inside the heading was already `aria-hidden`. Width is in `em` of
              the display size so it tracks the headline at every breakpoint
              instead of needing its own responsive scale. */}
          <h1 className="mt-7 text-balance text-display font-bold text-foreground">
            {BRAND_HEADLINE_LEAD}{" "}
            {/* The space is NOT redundant next to the <br>. Anything that
                flattens this heading to a string — a screen reader that treats
                <br> as a break rather than whitespace, a share preview, a
                scraper — otherwise reads «كالعباراتالتي». One character. */}
            <br />
            {BRAND_HEADLINE_REST_BEFORE}
            <span className="sr-only"> {BRAND_HEADLINE_ACCENT}</span>
          </h1>

          <div
            aria-hidden="true"
            className="mt-5 flex justify-center text-display"
          >
            <span className="block h-[0.075em] w-[3.6em] rounded-full bg-accent" />
          </div>

          <p className="mx-auto mt-6 max-w-measure text-pretty text-lead text-muted-foreground">
            {BRAND_SUBHEAD}
          </p>

          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/episodes"
              className="inline-flex h-12 items-center gap-2 rounded-full bg-primary px-7 text-body font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:scale-[1.02] hover:shadow-xl hover:shadow-primary/30"
            >
              استكشف الحلقات
              <ArrowLeft className="h-4 w-4" />
            </Link>
            {featured ? (
              <Link
                href={`/episodes/${featured.slug}`}
                className="inline-flex h-12 items-center gap-2 rounded-full border border-border bg-card px-7 text-body font-semibold text-foreground transition-colors hover:bg-secondary"
              >
                <Play className="h-4 w-4 fill-current text-accent" />
                {/* Same verb as the card below, which links to the SAME
                    episode — the hero and the card disagreed on the verb;
                    unified 2026-08-04, then corrected to «شاهد» on 08-05 —
                    BOTH go to /episodes/[slug], which renders a YOUTUBE
                      EMBED. 41 of 41 episodes carry a youtube_url and NONE
                      carries an audio_url, so no audio player has ever
                      rendered there: pressing «استمع» landed you on a video.
                      «استمع» is kept where it is true — /listen, the footer,
                      and «استمع على» beside the platform tiles, which go to
                      Apple, Spotify and Amazon. Khaled caught this. */}
                شاهد الأحدث
              </Link>
            ) : null}
          </div>
        </div>
      </section>

      {/* ──────────────────── Teaser (upcoming episode) ──────────── */}
      {/* No active teaser → nothing renders (no placeholder, no layout
          shift — acceptance م3). Disappears automatically once the linked
          episode publishes (م4), driven by the cache tag. */}
      {activeTeaser ? <TeaserSection teaser={activeTeaser} /> : null}

      {/* ──────────────────── Featured episode ──────────────────── */}
      {featured ? (
        <section className="px-6 pb-8">
          <div className="mx-auto max-w-6xl">
            <SectionLabel>الحلقة الأحدث</SectionLabel>
            <Link
              href={`/episodes/${featured.slug}`}
              className="group mt-5 grid items-center gap-8 rounded-[28px] border border-border bg-card p-4 shadow-[0_2px_8px_hsl(var(--primary)/0.04),0_24px_60px_-30px_hsl(var(--primary)/0.28)] transition-all hover:shadow-[0_2px_8px_hsl(var(--primary)/0.05),0_36px_80px_-30px_hsl(var(--primary)/0.35)] sm:p-5 lg:grid-cols-[1.5fr_1fr]"
            >
              {/* Bare frame. The «شاهد الآن» pill that used to sit at
                  bottom-start landed on the poster's burned-in title — every
                  thumbnail in this archive has its type baked into the artwork
                  — and it repeated the «شاهد الحلقة» CTA that is already in
                  the column beside it. */}
              <div className="relative aspect-video overflow-hidden rounded-2xl bg-secondary">
                <EpisodeThumb
                  ep={featured}
                  priority
                  sizes="(max-width: 1024px) 100vw, 700px"
                  className="transition-transform duration-700 group-hover:scale-[1.03]"
                />
              </div>
              {/* The card's empty half was two separate faults, not one.
                  HORIZONTAL: nothing capped or filled the text column.
                  VERTICAL: the column printed a title and a duration and
                  stopped, leaving ~200px of blank card beside a 364px image,
                  because `featured.summary` — the only paragraph the card
                  could render — is NULL on all 41 published episodes. The
                  prose lives in `description`; `episodeBlurb` is the shared
                  fallback (and strips the YouTube link/hashtag tail).
                  The meta line adds only fields that are actually populated
                  here: release_date on 42/42 and category on 42/42. No
                  episode NUMBER — it is stored, but 77 of these rows are
                  clips, so printing «الحلقة ٧٧» would state something the
                  data does not mean. */}
              <div className="flex flex-col px-2 pb-2 lg:px-4">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-micro text-muted-foreground">
                  <span>{formatArabicDate(featured.release_date)}</span>
                  {featured.category?.name ? (
                    <>
                      <span aria-hidden="true" className="text-border">
                        •
                      </span>
                      <span className="rounded-full border border-border bg-secondary px-2 py-0.5 font-medium">
                        {featured.category.name}
                      </span>
                    </>
                  ) : null}
                </div>
                {featured.guest?.name ? (
                  <span className="mt-3 text-lead font-bold text-accent">{featured.guest.name}</span>
                ) : null}
                {/* `displayEpisodeTitle`, matching every card in the grid
                    below. Raw `featured.title` printed the YouTube brand stamp
                    («… مقاطع من بودكاست خط») on the one card that sets the
                    tone for the page, while the six cards under it did not. */}
                <h3 className="mt-2 text-pretty text-subhead font-bold text-foreground lg:text-heading">
                  {displayEpisodeTitle(featured.title)}
                </h3>
                {featuredBlurb ? (
                  <p className="mt-3 line-clamp-3 text-body text-muted-foreground">
                    {featuredBlurb}
                  </p>
                ) : null}
                <div className="mt-5 flex items-center gap-3 text-caption text-muted-foreground">
                  {episodeDurationLabel(featured.duration_minutes) ? (
                    <span>{episodeDurationLabel(featured.duration_minutes)}</span>
                  ) : null}
                  <span className="inline-flex items-center gap-1 font-semibold text-primary transition-all group-hover:gap-2">
                    شاهد الحلقة <ArrowLeft className="h-4 w-4" />
                  </span>
                </div>
              </div>
            </Link>
          </div>
        </section>
      ) : null}

      {/* ──────────────────── Newsletter ────────────────────
          Sits ABOVE the episodes grid on purpose. Its old spot was two short
          sections above the footer band, so both asks landed within ~1.25
          screens of each other and the first caught nobody the footer wouldn't.
          max-w-6xl (not 3xl) so the band's edges line up with the featured
          card and the grid instead of pinching in mid-page. */}
      <section className="px-6 py-8">
        <div className="mx-auto max-w-6xl">
          <NewsletterSignup variant="inline" />
        </div>
      </section>

      {/* ─────────────────────── الضيوف ───────────────────────
          A strip of faces, above the episodes and separate from them.

          This REVERSES the earlier interleave («حلقتين وبعدها ضيف», a guest on
          every third cell): Khaled asked for the two to split, so the grid is
          episodes only now and the people get their own rail. The cap of three
          went with it — the strip is meant to carry everyone, and it grows by a
          season each year rather than by a card. */}
      {stripGuests.length > 0 ? (
        <section className="px-6 pt-12 pb-2">
          <div className="mx-auto max-w-6xl">
            <div className="mb-6 flex items-end justify-between gap-4">
              <SectionLabel>الضيوف</SectionLabel>
              <Link
                href="/guests"
                className="inline-flex shrink-0 items-center gap-1 text-caption font-semibold text-primary transition-all hover:gap-2"
              >
                كل الضيوف
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </div>
            <GuestStrip guests={stripGuests} />
          </div>
        </section>
      ) : null}

      {/* ─────────────────────── قاعة الحلقات ───────────────────────
          Episodes only. The heading is the filter's own label, and «الكل»
          points wherever the rest of that filter actually lives — the topic's
          page for a topic, /episodes otherwise. */}
      {grid.length > 0 ? (
        <section className="px-6 py-12">
          <div className="mx-auto max-w-6xl">
            <div className="flex items-end justify-between gap-4">
              <SectionLabel>{gridLabel}</SectionLabel>
              <div className="flex shrink-0 items-center gap-4">
                <Link
                  href="/guests"
                  className="text-caption font-semibold text-muted-foreground transition-colors hover:text-foreground"
                >
                  الضيوف
                </Link>
                <Link
                  href={moreHref}
                  className="inline-flex items-center gap-1 text-caption font-semibold text-primary transition-all hover:gap-2"
                >
                  {hiddenCount > 0 ? `كل الحلقات (${hiddenCount}+)` : "كل الحلقات"}
                  <ArrowLeft className="h-4 w-4" />
                </Link>
              </div>
            </div>
            <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {grid.map((ep) => (
                <EpisodePosterCard key={`e-${ep.id}`} ep={ep} />
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {/* ──────────────────── Statement ──────────────────── */}
      <section className="px-6 py-24 sm:py-32">
        <div className="mx-auto max-w-4xl text-center">
          <p className="text-balance text-heading font-bold leading-prose text-foreground lg:text-title">
            في عالمٍ يتدفّق فيه الكلام بلا توقّف،
            <br className="hidden sm:block" />{" "}
            <span className="text-muted-foreground">اخترنا أن نتوقّف… </span>
            <span className="text-accent">لننصت</span>.
          </p>
        </div>
      </section>

      {/* ──────────────────── Season partners ────────────────────
          Placed here on purpose: after the statement, before the two CTAs. A
          sponsor is paying for association with the show, not for interrupting
          it, so the band sits below every editorial section and above «كن
          شريكاً» — the ask it gives evidence for. It renders nothing at all
          when no partner is flagged for the homepage. */}
      <SponsorStrip partners={partners} className="px-0 pb-4" />

      {/* ──────────────────── Join CTA ──────────────────── */}
      <section className="px-6 pb-24">
        <div className="mx-auto grid max-w-6xl gap-5 sm:grid-cols-2">
          <CtaCard
            href="/guest"
            eyebrow="انضم إلينا"
            title="كن ضيفاً على خط"
            body="لديك قصة أو فكرة تستحق أن تُروى؟ نحن نبحث عن العقول التي تطرح الأسئلة التي تغيّر طريقة التفكير."
          />
          <CtaCard
            href="/partner"
            eyebrow="دعم الإرث"
            title="كن شريكاً"
            body="من يدعم الأفكار يرسم ملامح مستقبل الفكر. لنبنِ معاً مساحةً للحوارات التي تستحق أن تبقى."
            accent
          />
        </div>
      </section>
    </div>
  )
}

/**
 * The season خط is currently on, for the hero badge — or `null`.
 *
 * The NEWEST خط episode's own category, not a constant and not a lookup of
 * «الموسم الاول»: see the switch point in `lib/episodes/programs.ts`. Skips the
 * separate program and the clips (they are not seasons of خط, and the clips are
 * the most recent uploads, so a naive "newest episode" would print «مقاطع خط»
 * as the season) and skips khat episodes that have no category yet.
 *
 * Reads the list the page has already fetched — no extra query.
 */
function currentKhatSeason(episodes: Episode[]): string | null {
  const seasoned = filterLane(episodes, "khat").filter((ep) => ep.category?.name)
  if (seasoned.length === 0) return null
  // Explicit sort: `getCachedPublicEpisodes()` does not promise date order.
  const newest = seasoned.reduce((a, b) =>
    new Date(b.release_date).getTime() > new Date(a.release_date).getTime() ? b : a,
  )
  return newest.category?.name ?? null
}



// ─── pieces ──────────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-caption font-bold uppercase text-muted-foreground">
      {children}
    </h2>
  )
}


function CtaCard({
  href,
  eyebrow,
  title,
  body,
  accent,
}: {
  href: string
  eyebrow: string
  title: string
  body: string
  accent?: boolean
}) {
  return (
    <Link
      href={href}
      className={`group relative overflow-hidden rounded-[26px] p-8 transition-all hover:-translate-y-1 sm:p-10 ${
        accent
          ? "bg-primary text-primary-foreground shadow-xl shadow-primary/25"
          : "border border-border bg-card text-foreground shadow-sm hover:shadow-lg"
      }`}
    >
      <span
        className={`text-micro font-bold uppercase ${
          accent ? "text-primary-foreground/70" : "text-muted-foreground"
        }`}
      >
        {eyebrow}
      </span>
      <h3 className="mt-3 text-subhead font-bold">{title}</h3>
      <p
        className={`mt-3 text-body ${
          accent ? "text-primary-foreground/85" : "text-muted-foreground"
        }`}
      >
        {body}
      </p>
      <span className="mt-6 inline-flex items-center gap-1.5 text-caption font-semibold transition-all group-hover:gap-3">
        ابدأ الآن <ArrowLeft className="h-4 w-4" />
      </span>
    </Link>
  )
}
