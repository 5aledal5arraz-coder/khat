import { Metadata } from "next"
import { notFound } from "next/navigation"
import { getEpisodes } from "@/lib/queries/episodes"
import { getCategoriesForRequest } from "@/lib/queries/categories"
import { getCachedEpisodeCounts } from "@/lib/cache"
import { resolveCategorySlug } from "@/lib/episodes/category-filter"
import { EpisodePosterCard } from "@/components/episodes/episode-poster-card"
import { CategoryChips } from "@/components/episodes/category-chips"

// The taxonomy is admin-driven; render on every request.
export const dynamic = "force-dynamic"

interface CategoryPageProps {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: CategoryPageProps): Promise<Metadata> {
  const { slug } = await params
  const resolved = resolveCategorySlug(await getCategoriesForRequest(), slug)

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

  return {
    title: `${resolved.category.name} — خط بودكاست`,
    description: `كل حلقات بودكاست خط ضمن تصنيف ${resolved.category.name}`,
    alternates: {
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

  // Filtered listing goes to getEpisodes(), never the cached full-archive
  // snapshot. `getCategoriesForRequest` inside the pipeline is the SAME
  // request-scoped result already loaded above — no second SELECT.
  const [episodes, counts] = await Promise.all([
    getEpisodes({ category: category.slug }).catch(() => []),
    getCachedEpisodeCounts().catch(() => undefined),
  ])

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

          <CategoryChips
            className="mt-6"
            categories={categories}
            activeSlug={category.slug}
            counts={counts}
            hrefFor={(chipSlug) =>
              chipSlug ? `/categories/${encodeURIComponent(chipSlug)}` : "/episodes"
            }
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
