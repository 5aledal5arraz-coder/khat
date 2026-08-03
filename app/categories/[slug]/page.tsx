import { Metadata } from "next"
import { notFound } from "next/navigation"
import { getEpisodes } from "@/lib/queries/episodes"
import { getCategoriesForRequest } from "@/lib/queries/categories"
import { getCachedEpisodeCounts } from "@/lib/cache"
import { resolveCategorySlug } from "@/lib/episodes/category-filter"
import { EpisodePosterCard } from "@/components/episodes/episode-poster-card"
import { ArchiveNav } from "@/components/episodes/archive-nav"
import {
  DEFAULT_LANE,
  categoryMetadata,
  laneGroups,
  laneOfCategorySlug,
  showsGroupRow,
  type ProgramLane,
} from "@/lib/episodes/programs"

/** The archive view for a whole lane. `/episodes` already means the default. */
function laneUrl(lane: ProgramLane): string {
  return lane === DEFAULT_LANE ? "/episodes" : `/episodes?lane=${lane}`
}

// The taxonomy is admin-driven; render on every request.
export const dynamic = "force-dynamic"

interface CategoryPageProps {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: CategoryPageProps): Promise<Metadata> {
  const { slug } = await params
  const categories = await getCategoriesForRequest()
  const resolved = resolveCategorySlug(categories, slug)

  if (resolved.state !== "known") {
    // Stops metadata generation for a slug that has no category, so the page
    // never advertises a title/canonical for something that doesn't exist.
    //
    // It does NOT currently produce a 404 status: measured, an unknown slug
    // still responds 200 here — and so does app/guests/[slug], which carries
    // the same guard and the same claim. Harmless as-is (the body's
    // notFound() still renders the not-found UI), but the status code is a
    // separate, unsolved problem — don't read this as "404 handled".
    notFound()
  }

  // The copy follows the CLASSIFICATION, and the classification has exactly one
  // home (lib/episodes/programs.ts). Writing it here is what produced a <title>
  // reading «سالفة — خط بودكاست» over a body reading «سالفة» برنامج مستقل — مو
  // من حلقات بودكاست خط»: two answers to one question, and because this page
  // holds the canonical, the wrong one is the one that gets indexed.
  return {
    ...categoryMetadata(resolved.category, categories),
    alternates: {
      // This route stays the canonical home of a category — it is the leaf the
      // sitemap submits and the one every episode page links to. The three URLs
      // that render this same list now all point HERE (see /episodes), instead
      // of the duplicate declaring itself the original while the original said
      // nothing at all.
      canonical: `https://khatpodcast.com/categories/${encodeURIComponent(resolved.category.slug)}`,
    },
  }
}

export default async function CategoryPage({ params }: CategoryPageProps) {
  const { slug } = await params
  const categories = await getCategoriesForRequest()
  const resolved = resolveCategorySlug(categories, slug)

  if (resolved.state !== "known") {
    notFound()
  }

  const category = resolved.category
  const lane = laneOfCategorySlug(category.slug)

  // Filtered listing goes to getEpisodes(), never the cached full-archive
  // snapshot. `getCategoriesForRequest` inside the pipeline is the SAME
  // request-scoped result already loaded above — no second SELECT.
  const [episodes, counts] = await Promise.all([
    getEpisodes({ category: category.slug }).catch(() => []),
    getCachedEpisodeCounts().catch(() => undefined),
  ])

  // ── THE EXPIRY ALARM FOR THE NAVIGATION DECISION DOCUMENTED BELOW ─────────
  // That decision — `groupHref` sending a visitor from this canonical page to
  // `/episodes?category=X`, which is NOT canonical — rests partly on the season
  // row not rendering at all today. That half of the argument stops being true
  // the moment a second season exists, and the change arrives as a row in
  // Postgres: no test in this repository can see it coming, and the row would
  // simply appear with the hop live and nobody looking. So it says so, once,
  // at the one moment it becomes detectable. Same shape as the lane-drift
  // warning in archive-nav: it reports, it does not correct.
  if (showsGroupRow(laneGroups(categories, lane, counts))) {
    console.warn(
      "[episodes] the season row is now live on /categories/* — `groupHref` here " +
        "points at /episodes?category=…, whose canonical is /categories/…, so this " +
        "page now links out of the canonical set. Deliberate while the row was " +
        "invisible; it is visible now. Revisit with sara/Khaled. " +
        "See showsGroupRow() in lib/episodes/programs.ts.",
    )
  }

  return (
    <div className="px-6 pb-24 pt-14 sm:pt-20">
      <div className="mx-auto max-w-6xl">
        <header className="text-center">
          <span className="text-micro font-bold uppercase text-accent">
            تصنيف
          </span>
          <h1 className="mt-3 text-heading font-bold text-foreground sm:text-title">
            {category.name}
          </h1>
          <p className="mt-4 text-body text-muted-foreground">
            {episodes.length > 0
              ? `${episodes.length} حلقة في «${category.name}»`
              : `ما فيه حلقات في تصنيف «${category.name}» بعد`}
          </p>

          {/* The SAME two-level nav as /episodes, so the taxonomy a visitor
              sees is one taxonomy. This route keeps working and keeps its own
              canonical — it is a leaf, not a second archive — so every link
              here points back into /episodes rather than deeper into
              /categories/*. The old flat chip row reproduced the exact
              ambiguity that page was rebuilt to remove.

              KNOWN AND DELIBERATE CONSEQUENCE: `groupHref` below points at
              `/episodes?category=X`, whose canonical is `/categories/X`. So
              this page — itself the canonical for its own list — links to no
              other canonical URL, and `components/episodes/episode-hero.tsx`
              answers the same question the other way, linking straight to
              /categories/* precisely BECAUSE it is canonical.

              LEFT AS IT IS, on three counts of DIFFERENT STRENGTH, and saying
              so matters because the first one expires.
                1. MEASURED. The season row is the only thing `groupHref`
                   feeds, and it does not render at all today: خط has one
                   category, so `showsGroupRow()` is false and nothing here is
                   reachable. TRUE UNTIL «الموسم الثاني» — which is why the
                   warning above exists, and it is the whole reason this leg
                   could be leaned on at all.
                2. MEASURED. The canonical is correct either way, so a crawler
                   consolidates properly and the only cost is one extra hop.
                3. ASSERTED, NOT PROVEN, and labelled as such: "from a category
                   page every control returns you to the archive" is read off
                   the code, not off a decision anyone is recorded as making —
                   this comment is its only source, and it was written in the
                   same commit as the code. It is still the right default (a
                   redesign is sara's and Khaled's call, and quietly flipping
                   it would be the undocumented second answer this comment
                   exists to prevent) but it must not be quoted as evidence. */}
          <ArchiveNav
            className="mt-6"
            categories={categories}
            activeLane={lane}
            activeSlug={category.slug}
            counts={counts}
            laneHref={laneUrl}
            groupHref={(slug) => `/episodes?category=${encodeURIComponent(slug)}`}
          />
        </header>

        {/* No badge on the cards here — on a category page every card carries
            the same one, so it is pure noise. */}
        {episodes.length > 0 ? (
          <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {episodes.map((ep) => (
              <EpisodePosterCard key={ep.id} ep={ep} />
            ))}
          </div>
        ) : (
          <div className="mt-16 rounded-3xl border border-dashed border-border bg-card/50 px-6 py-20 text-center">
            <p className="text-lead font-bold text-foreground">
              ما فيه حلقات في تصنيف «{category.name}» بعد
            </p>
            <p className="mt-2 text-caption text-muted-foreground">
              بتظهر هنا أول ما تنضاف حلقة لهذا التصنيف.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
