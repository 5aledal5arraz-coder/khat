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
    // Trigger a REAL 404 response, not a soft-404 body with HTTP 200: once
    // metadata commits a successful response, the body's notFound() can no
    // longer change the status. Same guard as app/guests/[slug]/page.tsx.
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
          <span className="text-[12px] font-bold uppercase tracking-[0.18em] text-accent">
            تصنيف
          </span>
          <h1 className="mt-3 text-4xl font-extrabold tracking-tight text-foreground sm:text-5xl">
            {category.name}
          </h1>
          <p className="mt-4 text-[15px] text-muted-foreground">
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
            <p className="text-lg font-bold text-foreground">
              ما فيه حلقات في تصنيف «{category.name}» بعد
            </p>
            <p className="mt-2 text-[14px] text-muted-foreground">
              بتظهر هنا أول ما تنضاف حلقة لهذا التصنيف.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
