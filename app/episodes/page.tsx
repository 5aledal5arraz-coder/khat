import { Metadata } from "next"
import Link from "next/link"
import { Search } from "lucide-react"
import { getEpisodes } from "@/lib/queries/episodes"
import { getCategoriesForRequest } from "@/lib/queries/categories"
import { resolveCategorySlug } from "@/lib/episodes/category-filter"
import { getCachedPublicEpisodes, getCachedEpisodeCounts } from "@/lib/cache"
import { EpisodePosterCard } from "@/components/episodes/episode-poster-card"
import { CategoryChips } from "@/components/episodes/category-chips"
import type { Episode } from "@/types/database"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "الحلقات",
  description: "استعرض جميع حلقات بودكاست خط — حوارات عميقة وأفكار تبقى.",
}

interface EpisodesPageProps {
  searchParams: Promise<{ search?: string; category?: string }>
}

/** `/episodes` with the search and category that are currently in effect. */
function archiveHref(search: string | undefined, categorySlug: string | null): string {
  const params = new URLSearchParams()
  if (categorySlug) params.set("category", categorySlug)
  if (search) params.set("search", search)
  const qs = params.toString()
  return qs ? `/episodes?${qs}` : "/episodes"
}

export default async function EpisodesPage({ searchParams }: EpisodesPageProps) {
  const { search, category } = await searchParams
  const query = search?.trim() || undefined

  // One query for the chips — and `applyListPipeline` reuses the very same
  // result (React `cache()`), so the category feature costs ONE extra query
  // per page load, not one per episode.
  const categories = await getCategoriesForRequest()
  const resolved = resolveCategorySlug(categories, category)
  const activeSlug = resolved.state === "known" ? resolved.category.slug : null

  // An unknown slug deliberately does NOT filter: filtering by it would return
  // an empty archive, which reads as a truthful "no episodes" answer. We show
  // the whole archive and say the category is unknown.
  const filtered = query !== undefined || activeSlug !== null

  const episodes: Episode[] = filtered
    // withCategories: this grid renders the category badge (`showCategory`
    // below), and a search-only filter would otherwise skip the lookup.
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

  // Counts describe the whole archive, so they contradict a search result —
  // show them only when no search narrows the list.
  const counts = query ? undefined : await getCachedEpisodeCounts().catch(() => undefined)

  const categoryScope = resolved.state === "known" ? ` في «${resolved.category.name}»` : ""

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
            {/* The active category must survive a search. A GET form submits
                ONLY its own fields, so without this hidden input the first
                search silently drops the filter the visitor just chose. */}
            {activeSlug ? <input type="hidden" name="category" value={activeSlug} /> : null}
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

          {/* Category filter — under the search, and every chip carries the
              current search so the two compose in both directions. */}
          <CategoryChips
            className="mt-5"
            categories={categories}
            activeSlug={activeSlug}
            counts={counts}
            hrefFor={(slug) => archiveHref(query, slug)}
          />
        </header>

        {/* An unknown category is an error, not a result. Say it, and keep the
            archive visible instead of showing a blank page. */}
        {resolved.state === "unknown" ? (
          <div className="mt-10 rounded-2xl border border-border bg-secondary px-5 py-4 text-center text-caption">
            <p className="font-semibold text-foreground">تصنيف غير معروف</p>
            <p className="mt-1 text-muted-foreground">
              ما فيه تصنيف بالاسم «{resolved.slug}» — هذي كل الحلقات.
            </p>
            <Link
              href="/episodes"
              className="mt-2 inline-block font-semibold text-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              عرض الكل
            </Link>
          </div>
        ) : null}

        {/* Result summary. The zero case for a KNOWN category is left to the
            empty state below, which says it in full rather than twice. */}
        {filtered && (episodes.length > 0 || query) ? (
          <div className="mt-10 flex items-center justify-between gap-3 text-caption">
            <span className="text-muted-foreground">
              {episodes.length > 0
                ? `${episodes.length} نتيجة${query ? ` لـ «${query}»` : ""}${categoryScope}`
                : `لا توجد نتائج لـ «${query}»${categoryScope}`}
            </span>
            <Link
              href="/episodes"
              className="shrink-0 font-semibold text-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              عرض الكل
            </Link>
          </div>
        ) : null}

        {/* Grid */}
        {episodes.length > 0 ? (
          <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {episodes.map((ep) => (
              <EpisodePosterCard key={ep.id} ep={ep} showCategory />
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
