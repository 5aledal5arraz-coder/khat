import { Suspense } from "react"
import { Metadata } from "next"
import Link from "next/link"
import Image from "next/image"
import { getEpisodes, getMostViewedRecent, getEpisodeCounts, getPublicSections } from "@/lib/supabase/queries"
import { EpisodeFilters } from "@/components/episodes/episode-filters"
import { EpisodesGrid } from "@/components/episodes/episodes-grid"
import { EpisodeCard } from "@/components/episodes/episode-card"
import { ContinueWatching } from "@/components/episodes/continue-watching"
import { HiddenGems } from "@/components/episodes/hidden-gems"
import { Skeleton } from "@/components/ui/skeleton"
import { Play, Clock, Calendar } from "lucide-react"
import { formatDuration, formatDate, getYouTubeId } from "@/lib/utils"
import { getHiddenGems, interleaveBoosts } from "@/lib/boost"
import { SponsoredCard } from "@/components/ads/sponsored-card"
import { AdBanner } from "@/components/ads/ad-banner"

export const metadata: Metadata = {
  title: "الحلقات",
  description: "استعرض جميع حلقات بودكاست خط",
}

interface EpisodesPageProps {
  searchParams: Promise<{
    search?: string
    category?: string
    sort?: string
  }>
}

const INITIAL_EPISODES = 9

async function FeaturedEpisode() {
  const episode = await getMostViewedRecent(30)

  if (!episode) return null

  const videoId = getYouTubeId(episode.youtube_url)
  const viewCount = episode.view_count ? new Intl.NumberFormat('ar-SA').format(episode.view_count) : null

  return (
    <Link href={`/episodes/${episode.slug}`} className="group block">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/20 to-transparent">
        <div className="flex flex-col gap-6 p-6 md:flex-row md:items-center">
          {/* Thumbnail */}
          <div className="relative aspect-video w-full overflow-hidden rounded-xl md:w-2/5">
            <Image
              src={`https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`}
              alt={episode.title}
              fill
              sizes="(max-width: 768px) 100vw, 40vw"
              className="object-cover transition-transform group-hover:scale-105"
            />
            <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-t from-black/60 via-black/20 to-transparent">
              {/* Elegant Play Button */}
              <div className="relative">
                {/* Outer glow ring */}
                <div className="absolute -inset-4 rounded-full bg-primary/20 blur-xl transition-all group-hover:bg-primary/30 group-hover:scale-110" />
                {/* Pulsing ring */}
                <div className="absolute -inset-2 rounded-full border-2 border-white/20 group-hover:animate-ping" />
                {/* Main button */}
                <div className="relative flex h-20 w-20 items-center justify-center rounded-full border border-white/30 bg-white/10 backdrop-blur-md transition-all group-hover:scale-110 group-hover:bg-white/20">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary shadow-lg shadow-primary/50">
                    <Play className="h-6 w-6 ms-1 text-primary-foreground" fill="currentColor" />
                  </div>
                </div>
              </div>
            </div>
            <div className="absolute bottom-3 start-3 flex items-center gap-1 rounded bg-black/70 px-2 py-1 text-xs text-white">
              <Clock className="h-3 w-3" />
              <span>{formatDuration(episode.duration_minutes)}</span>
            </div>
          </div>

          {/* Info */}
          <div className="flex-1 space-y-3">
            <div className="inline-flex items-center gap-2">
              <span className="inline-block rounded-full bg-primary/20 px-3 py-1 text-xs font-medium text-primary">
                الأكثر مشاهدة
              </span>
              {viewCount && (
                <span className="text-xs text-muted-foreground">{viewCount} مشاهدة</span>
              )}
            </div>
            <h2 className="text-2xl font-bold leading-tight group-hover:text-primary transition-colors md:text-3xl">
              {episode.title}
            </h2>
            {episode.guest && (
              <p className="text-muted-foreground">
                مع {episode.guest.name}
              </p>
            )}
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <div className="flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                <span>{formatDate(episode.release_date)}</span>
              </div>
              {episode.season && (
                <span>الموسم {episode.season}</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </Link>
  )
}

function FeaturedSkeleton() {
  return (
    <div className="rounded-2xl bg-gradient-to-br from-primary/20 to-transparent p-6">
      <div className="flex flex-col gap-6 md:flex-row md:items-center">
        <Skeleton className="aspect-video w-full rounded-xl md:w-2/5" />
        <div className="flex-1 space-y-3">
          <Skeleton className="h-6 w-24 rounded-full" />
          <Skeleton className="h-10 w-3/4" />
          <Skeleton className="h-5 w-1/3" />
          <Skeleton className="h-4 w-1/4" />
        </div>
      </div>
    </div>
  )
}

async function EpisodesContent({ searchParams }: { searchParams: Awaited<EpisodesPageProps['searchParams']> }) {
  const sortOrder = searchParams.sort === "oldest" ? "asc" : "desc"
  const isDefaultView = !searchParams.search && !searchParams.category

  let episodes = await getEpisodes({
    search: searchParams.search,
    category: searchParams.category,
  })

  // Sort by date only when not searching — search results are ranked by relevance
  if (!searchParams.search) {
    episodes = [...episodes].sort((a, b) => {
      const dateA = new Date(a.release_date).getTime()
      const dateB = new Date(b.release_date).getTime()
      return sortOrder === "asc" ? dateA - dateB : dateB - dateA
    })
  }

  if (episodes.length === 0) {
    // Fetch a few popular episodes to suggest
    const suggestions = await getEpisodes({ limit: 3 })

    return (
      <div className="py-12 text-center">
        <p className="text-lg text-muted-foreground">
          {searchParams.search
            ? `لا توجد نتائج لـ "${searchParams.search}"`
            : "لا توجد حلقات في هذا التصنيف"}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          جرّب البحث بكلمات مختلفة أو تصفّح الحلقات الأخرى
        </p>
        {suggestions.length > 0 && (
          <div className="mt-8 text-start">
            <h3 className="mb-4 text-lg font-semibold">حلقات قد تعجبك</h3>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {suggestions.map((ep) => (
                <EpisodeCard key={ep.id} episode={ep} />
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  // On default view, interleave low-view episodes into the grid.
  // `episodes` is already the full unfiltered set here (no search/category),
  // so reuse it instead of fetching again.
  let displayEpisodes = episodes
  if (isDefaultView && sortOrder === "desc") {
    const gemsIds = new Set(getHiddenGems(episodes, 5).map((e) => e.id))
    displayEpisodes = interleaveBoosts(episodes, episodes, { excludeIds: gemsIds })
  }

  const initialEpisodes = displayEpisodes.slice(0, INITIAL_EPISODES)

  // Key forces React to remount the grid when filters change,
  // resetting the useState inside EpisodesGrid.
  const gridKey = `${searchParams.category || ""}-${searchParams.sort || ""}-${searchParams.search || ""}`

  return (
    <EpisodesGrid
      key={gridKey}
      initialEpisodes={initialEpisodes}
      totalCount={displayEpisodes.length}
      category={searchParams.category}
      sort={searchParams.sort}
      search={searchParams.search}
    />
  )
}

function EpisodesGridSkeleton() {
  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="space-y-3">
          <Skeleton className="aspect-video w-full rounded-xl" />
          <Skeleton className="h-6 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      ))}
    </div>
  )
}

async function FiltersWithCounts() {
  const [counts, sections] = await Promise.all([
    getEpisodeCounts(),
    getPublicSections(),
  ])
  return <EpisodeFilters counts={counts} sections={sections} />
}

export default async function EpisodesPage({ searchParams }: EpisodesPageProps) {
  const resolvedSearchParams = await searchParams
  const showFeatured = !resolvedSearchParams.category && !resolvedSearchParams.search

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="sr-only">حلقات بودكاست خط</h1>

      {/* Featured Episode - only on default view */}
      {showFeatured && (
        <div className="mb-8">
          <Suspense fallback={<FeaturedSkeleton />}>
            <FeaturedEpisode />
          </Suspense>
        </div>
      )}

      {/* Sponsored Content - only on default view */}
      {showFeatured && (
        <div className="mb-8">
          <SponsoredCard />
        </div>
      )}

      {/* Continue Watching - client component */}
      <ContinueWatching />

      {/* Hidden Gems - only on default view */}
      {showFeatured && (
        <Suspense fallback={null}>
          <HiddenGems />
        </Suspense>
      )}

      {/* Filters */}
      <div className="mb-8">
        <Suspense fallback={<Skeleton className="h-10 w-full" />}>
          <FiltersWithCounts />
        </Suspense>
      </div>

      {/* Banner Ad */}
      <div className="mb-8">
        <AdBanner slot="episodes-top" size="medium" />
      </div>

      {/* Episodes Grid with Load More */}
      <Suspense fallback={<EpisodesGridSkeleton />}>
        <EpisodesContent searchParams={resolvedSearchParams} />
      </Suspense>
    </div>
  )
}
