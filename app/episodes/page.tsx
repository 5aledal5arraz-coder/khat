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
  filterLane,
  laneOfCategorySlug,
  laneUnitNoun,
  parseLane,
  type ProgramLane,
} from "@/lib/episodes/programs"
import { formatArabicCount } from "@/lib/shared/formatters"
import type { Episode } from "@/types/database"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "الحلقات",
  description: "استعرض جميع حلقات بودكاست خط — حوارات عميقة وأفكار تبقى.",
}

interface EpisodesPageProps {
  searchParams: Promise<{ search?: string; category?: string; lane?: string }>
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
        ? `${episodes.length} نتيجة لـ «${query}»${categoryScope}`
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
                className="absolute end-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
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
              {resolved.state === "known" && !query
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
