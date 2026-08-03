import { Metadata } from "next"
import Link from "next/link"
import { Search } from "lucide-react"
import { getEpisodes } from "@/lib/queries/episodes"
import { getCategoriesForRequest } from "@/lib/queries/categories"
import { resolveCategorySlug } from "@/lib/episodes/category-filter"
import { getCachedPublicEpisodes, getCachedEpisodeCounts } from "@/lib/cache"
import { EpisodePosterCard } from "@/components/episodes/episode-poster-card"
import { ArchiveNav } from "@/components/episodes/archive-nav"
import {
  DEFAULT_LANE,
  categoryMetadata,
  filterLane,
  laneCategories,
  laneLabel,
  laneNote,
  laneOfCategorySlug,
  laneUnitNoun,
  parseLane,
  type ProgramLane,
} from "@/lib/episodes/programs"
import { formatArabicCount } from "@/lib/shared/formatters"
import type { Episode, EpisodeCategory } from "@/types/database"

export const dynamic = "force-dynamic"

interface EpisodesPageProps {
  searchParams: Promise<{ search?: string; category?: string; lane?: string }>
}

/**
 * THE ARCHIVE HAD NO CANONICAL AT ALL, and this wave added a second family of
 * URLs to it. Measured, three URLs render the identical sixteen cards:
 *
 *   /categories/سالفة          16 cards   ✅ canonical → itself
 *   /episodes?lane=separate    16 cards   ❌ none
 *   /episodes?category=سالفة   16 cards   ❌ none
 *
 * A duplicate that declares itself the original while the original says nothing
 * is worse than either one alone: it is the only instruction a crawler is
 * given, so it is the one that wins. Every `/episodes` URL now declares where
 * its content really lives.
 *
 *   · `?category=X` is by definition the same list as /categories/X, which is
 *     the leaf the sitemap submits and every episode page links to. It points
 *     there.
 *   · A lane holding exactly ONE category IS that category — «سالفة» today — so
 *     it points there too, and stops doing so by itself the day a second
 *     separate programme is added. Derived from `laneCategories`, never from a
 *     second copy of the classification.
 *   · خط IS EXCLUDED from that collapse even though it also has one category
 *     right now: the lane also holds every uncategorised episode (measured: 20
 *     in the lane, 19 in «الموسم الاول»), so /categories/الموسم-الاول is a
 *     genuinely smaller list and pointing at it would drop an episode.
 *
 * A SEARCH NEVER REACHES THIS FUNCTION — see `generateMetadata` below. The
 * earlier note here said «`?search=` never survives», which was true about the
 * URL and wrong about the consequence: dropping the parameter does not make the
 * page uncanonical, it makes it claim to BE the unsearched page. Measured:
 *
 *   /episodes?search=غزو&lane=separate    → canonical /categories/سالفة
 *   /episodes?search=غزو&category=سالفة   → canonical /categories/سالفة
 *
 * i.e. every search inside a non-default lane declared itself a duplicate of
 * one category page, which is the single strongest instruction a crawler is
 * given about it. A canonical is "this content lives there"; a search result
 * over a subset is not that content. The right answer for an unbounded URL
 * space is to say it is not a page — `robots: noindex` — not to hand its rank
 * to a page it does not match.
 */
function canonicalFor(
  categories: EpisodeCategory[],
  lane: ProgramLane,
  activeSlug: string | null,
): string {
  const BASE = "https://khatpodcast.com"
  const categoryUrl = (slug: string) => `${BASE}/categories/${encodeURIComponent(slug)}`

  if (activeSlug !== null) return categoryUrl(activeSlug)
  if (lane !== DEFAULT_LANE) {
    const own = laneCategories(categories, lane)
    return own.length === 1 ? categoryUrl(own[0].slug) : `${BASE}/episodes?lane=${lane}`
  }
  return `${BASE}/episodes`
}

/** The archive as a whole — every lane, which is what a bare /episodes means. */
const ARCHIVE_DESCRIPTION = "استعرض جميع حلقات بودكاست خط — حوارات عميقة وأفكار تبقى."

/**
 * THE CANONICAL WAS FIXED HERE AND THE COPY WAS NOT — half a fix, and the half
 * that a crawler and every social unfurl actually read on this URL.
 *
 * `/categories/سالفة` was corrected to say «سالفة» برنامج مستقل — مو من حلقات
 * بودكاست خط», because its <head> contradicted its own body. The URL that
 * renders THE IDENTICAL SIXTEEN CARDS kept the archive-wide string:
 *
 *   /categories/سالفة        <description> «سالفة» برنامج مستقل — مو من …  ✅
 *   /episodes?lane=separate  <description> استعرض جميع حلقات بودكاست خط…   🔴
 *   /episodes?lane=clips     <description> استعرض جميع حلقات بودكاست خط…   🔴
 *
 * So the same contradiction survived, one URL over, on the copy the canonical
 * does not govern: a canonical consolidates ranking, it does not replace the
 * description a crawler quotes or the card a share preview draws. The title is
 * the same fault — «الحلقات» over six rows the page itself says are NOT
 * complete episodes.
 *
 * The fix is the one `/categories/[slug]` already got: the copy comes from the
 * CLASSIFICATION, not from a string beside it. `categoryMetadata` for a chosen
 * category — so the two URLs are now literally the same function call and
 * cannot drift again — and `laneLabel`/`laneNote` for a bare lane, which is
 * the sentence written for exactly this purpose.
 */
export async function generateMetadata({ searchParams }: EpisodesPageProps): Promise<Metadata> {
  const { search, category, lane } = await searchParams
  const query = search?.trim() || undefined
  const categories = await getCategoriesForRequest()
  const resolved = resolveCategorySlug(categories, category)
  const activeSlug = resolved.state === "known" ? resolved.category.slug : null
  const activeLane: ProgramLane =
    activeSlug !== null ? laneOfCategorySlug(activeSlug) : (parseLane(lane) ?? DEFAULT_LANE)

  // A LANE HOLDING EXACTLY ONE CATEGORY *IS* THAT CATEGORY — the same rule
  // `canonicalFor` already applies, applied to the copy so the two halves of
  // the <head> cannot disagree. Without it `?lane=separate` said «سالفة» while
  // the page it canonicalises to said «سالفة — برنامج منفصل», over the
  // identical sixteen cards: a second answer to one question, which is the
  // fault this whole change exists to remove. Derived from `laneCategories`,
  // never from a second copy of the classification, and it stops applying by
  // itself the day a second separate programme is added.
  const only = activeLane === DEFAULT_LANE ? [] : laneCategories(categories, activeLane)

  const copy: { title: string; description: string } =
    resolved.state === "known"
      ? // Byte-identical to what /categories/<slug> emits, by construction.
        categoryMetadata(resolved.category, categories)
      : only.length === 1
        ? categoryMetadata(only[0], categories)
        : activeLane !== DEFAULT_LANE
          ? {
              title: laneLabel(activeLane, categories),
              description: laneNote(activeLane, categories) ?? ARCHIVE_DESCRIPTION,
            }
          : // The default lane IS خط, and «استعرض جميع حلقات بودكاست خط» is a
            // true sentence about it. Left alone deliberately: `laneNote("khat")`
            // is the tab's one-line note, written to sit beside two other tabs,
            // and it is not the description of the archive's front door.
            { title: "الحلقات", description: ARCHIVE_DESCRIPTION }

  // A SEARCH IS NOT A PAGE. It is an unbounded URL space over the same archive,
  // so it gets no canonical at all — see canonicalFor above for why pointing it
  // at the category page was worse than pointing it nowhere. `follow` stays on:
  // the episode links in the results are still worth crawling.
  if (query) return { ...copy, robots: { index: false, follow: true } }

  return {
    ...copy,
    alternates: { canonical: canonicalFor(categories, activeLane, activeSlug) },
  }
}

/**
 * `/episodes` with a lane, a group, and the current search.
 *
 * `?category=` is left exactly as it was — every existing link, bookmark and
 * `/categories/*` chip keeps resolving — and `?lane=` is added only for the
 * lane tabs, which have no single category to point at. `?category=` is the
 * more specific of the two and therefore wins when both are present.
 */
function archiveHref(
  search: string | undefined,
  lane: ProgramLane | null,
  categorySlug: string | null,
): string {
  const params = new URLSearchParams()
  if (categorySlug) params.set("category", categorySlug)
  // The default lane needs no parameter: `/episodes` already means it.
  else if (lane && lane !== DEFAULT_LANE) params.set("lane", lane)
  if (search) params.set("search", search)
  const qs = params.toString()
  return qs ? `/episodes?${qs}` : "/episodes"
}

export default async function EpisodesPage({ searchParams }: EpisodesPageProps) {
  const { search, category, lane } = await searchParams
  const query = search?.trim() || undefined

  // One query for the nav — and `applyListPipeline` reuses the very same
  // result (React `cache()`), so the category feature costs ONE extra query
  // per page load, not one per episode.
  const categories = await getCategoriesForRequest()
  const resolved = resolveCategorySlug(categories, category)
  const activeSlug = resolved.state === "known" ? resolved.category.slug : null

  // Which program are we looking at? A chosen category answers it outright; a
  // bare `?lane=` answers it for the tabs, which have no category to point at.
  // Neither ⇒ حلقات خط, because خط is what this site is (م3).
  //
  // An unrecognised `?lane=` falls back silently, and unlike an unrecognised
  // `?category=` that is right: a lane key is a code constant that only our own
  // links produce, so it cannot be a stale bookmark of a renamed thing.
  const requestedLane: ProgramLane =
    activeSlug !== null ? laneOfCategorySlug(activeSlug) : (parseLane(lane) ?? DEFAULT_LANE)

  // A search with no lane and no category is ARCHIVE-WIDE, so no tab describes
  // it and none is marked current. Marking خط current over a result list that
  // can contain سالفة rows is the same "the label doesn't mean what it says"
  // fault this page was rebuilt to remove.
  const laneIsScoped = activeSlug !== null || parseLane(lane) !== null
  const activeLane: ProgramLane | null = query && !laneIsScoped ? null : requestedLane

  // An unknown slug deliberately does NOT filter: filtering by it would return
  // an empty archive, which reads as a truthful "no episodes" answer. We show
  // the whole archive and say the category is unknown.
  const filtered = query !== undefined || activeSlug !== null

  const rows: Episode[] = filtered
    // withCategories: the grid renders the category badge, the lane scoping
    // below needs the slug, and a search-only filter would otherwise skip the
    // lookup entirely.
    //
    // ── SECOND HALF OF THE SEASON SWITCH POINT ──────────────────────────────
    // `activeSlug` is an `ArchiveGroup.slug`, which today is a category slug.
    // When `episodes.season` is filled and `khatSeasonGroups()` starts deriving
    // groups from it (see lib/episodes/programs.ts), THIS call is the one that
    // becomes `getEpisodes({ season })`. There is no third place.
    ? await getEpisodes({
        search: query,
        category: activeSlug ?? undefined,
        withCategories: true,
      }).catch(() => [])
    : await getCachedPublicEpisodes()
      .then((list) =>
        [...list].sort(
          (a, b) =>
            new Date(b.release_date).getTime() - new Date(a.release_date).getTime(),
        ),
      )
      .catch(() => [])

  // Scope to the lane. Cheap and post-fetch on purpose: a lane is a set of
  // categories, and pushing it into SQL would mean a second category filter in
  // `getEpisodes` for a list this size (42 rows). Skipped when a category is
  // already selected — that IS the narrower filter — and when a search is
  // archive-wide, where scoping would hide the results the visitor asked for.
  const episodes =
    activeLane !== null && activeSlug === null ? filterLane(rows, activeLane) : rows

  // Counts describe the whole archive, so they contradict a search result —
  // show them only when no search narrows the list.
  const counts = query ? undefined : await getCachedEpisodeCounts().catch(() => undefined)

  const categoryScope = resolved.state === "known" ? ` في «${resolved.category.name}»` : ""

  // The scope is named ONLY when a season is selected. Naming the lane too
  // would print «٢٠ حلقة في «حلقات خط»» directly under a tab that already reads
  // «حلقات خط» — the count is the new information, the lane is not.
  const unit = laneUnitNoun(activeLane ?? DEFAULT_LANE)

  const summary =
    episodes.length === 0
      ? `لا توجد نتائج لـ «${query}»${categoryScope}`
      : query
        // THROUGH THE SAME FUNCTION, not a hand-written string beside it. This
        // branch printed «4 نتيجة» — Arabic takes the plural from 3 to 10 —
        // while the branch directly below it got the identical question right,
        // because that one goes through `formatArabicCount` and this one
        // interpolated the digit itself. Two ways to say one thing is how one
        // of them ends up wrong; «نتيجة» belongs in ARABIC_PLURALS like every
        // other counted noun on the site.
        ? `${formatArabicCount(episodes.length, "نتيجة")} لـ «${query}»${categoryScope}`
        : `${formatArabicCount(episodes.length, unit)}${categoryScope}`

  return (
    <div className="px-6 pb-24 pt-14 sm:pt-20">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <header className="text-center">
          <span className="text-micro font-bold uppercase text-accent">
            أرشيف الحوارات
          </span>
          <h1 className="mt-3 text-title font-bold text-foreground">
            الحلقات
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-body text-muted-foreground">
            كل حوار هو فكرة تستحق أن تبقى — استمع، تأمّل، ودوّن ما يستحق أن تضع
            تحته خط.
          </p>

          {/* Search — the visible submit button is required: it gives a
              clickable control AND guarantees Enter submits (a single-input
              form without a submit button is unreliable across browsers). */}
          <form action="/episodes" className="mx-auto mt-8 flex max-w-md items-center">
            {/* Where the visitor currently is must survive a search. A GET form
                submits ONLY its own fields, so without these the first search
                silently drops the program or season they just chose. `lane`
                only when no category is set — the category already implies it,
                and sending both would put a redundant parameter in every
                shared URL. */}
            {activeSlug ? <input type="hidden" name="category" value={activeSlug} /> : null}
            {!activeSlug && laneIsScoped ? (
              <input type="hidden" name="lane" value={requestedLane} />
            ) : null}
            <div className="relative w-full">
              <button
                type="submit"
                aria-label="بحث"
                // 44×44 inside a 48px-tall field — it fits with 2px of inset on
                // each side, so the target reaches the floor without the button
                // touching the border. Was 36px.
                className="absolute end-0.5 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                <Search className="h-4 w-4" />
              </button>
              <input
                type="search"
                name="search"
                defaultValue={query ?? ""}
                placeholder="ابحث عن حلقة أو ضيف…"
                className="h-12 w-full rounded-full border border-border bg-card pe-12 ps-5 text-body text-foreground shadow-sm outline-none transition-shadow placeholder:text-muted-foreground focus:border-primary/40 focus:ring-4 focus:ring-primary/10"
              />
            </div>
          </form>

          {/* The archive's two levels — program, then season. Under the search,
              and every link carries the current search so the two compose in
              both directions. */}
          <ArchiveNav
            className="mt-6"
            categories={categories}
            activeLane={activeLane}
            activeSlug={activeSlug}
            counts={counts}
            laneHref={(l) => archiveHref(query, l, null)}
            groupHref={(slug) => archiveHref(query, requestedLane, slug)}
          />
        </header>

        {/* An unknown category is an error, not a result. Say it, and keep the
            archive visible instead of showing a blank page. */}
        {resolved.state === "unknown" ? (
          <div className="mt-10 rounded-2xl border border-border bg-secondary px-5 py-4 text-center text-caption">
            <p className="font-semibold text-foreground">تصنيف غير معروف</p>
            {/* NOT «هذي كل الحلقات» any more: an unresolved slug falls back to
                the default lane, so what follows is حلقات خط — the other
                programs are one tab away. Saying "all" would be the same
                mislabelling this page was rebuilt to remove. */}
            <p className="mt-1 text-muted-foreground">
              ما فيه تصنيف بالاسم «{resolved.slug}» — هذي حلقات خط.
            </p>
            <Link
              href="/episodes"
              className="mt-2 inline-block font-semibold text-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              عرض حلقات خط
            </Link>
          </div>
        ) : null}

        {/* Result summary — ALWAYS states the size of what is on screen, not
            only when a filter is on. The old page printed a number for filtered
            views and nothing for the default one, which is how «الكل ٣٦» became
            the only number a visitor ever saw and the only one that was wrong.
            The zero case for a KNOWN category is left to the empty state below,
            which says it in full rather than twice. */}
        {episodes.length > 0 || query ? (
          <div className="mt-10 flex items-center justify-between gap-3 text-caption">
            <span className="text-muted-foreground">{summary}</span>
            {filtered ? (
              <Link
                href="/episodes"
                className="shrink-0 font-semibold text-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                عرض حلقات خط
              </Link>
            ) : null}
          </div>
        ) : null}

        {/* Grid */}
        {episodes.length > 0 ? (
          <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {/* The badge only where it distinguishes something. Inside a chosen
                season every card would carry the identical label, which is the
                same noise `/categories/[slug]` already refuses to print. */}
            {episodes.map((ep) => (
              <EpisodePosterCard key={ep.id} ep={ep} showCategory={activeSlug === null} />
            ))}
          </div>
        ) : (
          <div className="mt-16 rounded-3xl border border-dashed border-border bg-card/50 px-6 py-20 text-center">
            <p className="text-lead font-bold text-foreground">
              {/* A SEARCH that matched nothing is not an empty archive. This
                  card used to print «لا توجد حلقات بعد» under a summary line
                  already reading «لا توجد نتائج لـ …» — the same fact twice,
                  and the second telling saying something false: the archive is
                  full, the query just missed. */}
              {query
                ? "ما فيه شي يطابق بحثك"
                : resolved.state === "known"
                  ? `ما فيه حلقات في تصنيف «${resolved.category.name}» بعد`
                  : "لا توجد حلقات بعد"}
            </p>
            <p className="mt-2 text-caption text-muted-foreground">
              {query
                ? "جرّب البحث بكلمات مختلفة."
                : resolved.state === "known"
                  ? "بتظهر هنا أول ما تنضاف حلقة لهذا التصنيف."
                  : "ستظهر الحلقات هنا فور نشرها."}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
