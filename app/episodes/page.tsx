import { Suspense } from "react"
import { Metadata } from "next"
import Link from "next/link"
import Image from "next/image"
import { getEpisodes, getMostViewedRecent, getEpisodeCounts } from "@/lib/queries/episodes"
import { getCategories } from "@/lib/queries/categories"
import { getCachedPublicEpisodes } from "@/lib/cache"
import { EpisodeFilters } from "@/components/episodes/episode-filters"
import { EpisodesGrid } from "@/components/episodes/episodes-grid"
import { EpisodeCard } from "@/components/episodes/episode-card"
import { ContinueWatching } from "@/components/episodes/continue-watching"
import { HiddenGems } from "@/components/episodes/hidden-gems"
import { Play, Clock, Calendar } from "lucide-react"
import { formatDuration, formatDate, getYouTubeId } from "@/lib/utils"
import { getHiddenGems, interleaveBoosts } from "@/lib/episodes/boost"
import { BLUR_DATA_URL_16_9 } from "@/lib/image-utils"

// Note: searchParams usage below forces dynamic rendering in Next.js 15+
// ISR would require moving search/filter params to client-side state
export const dynamic = "force-dynamic"

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
  const viewCount = episode.view_count ? new Intl.NumberFormat('en').format(episode.view_count) : null

  return (
    <Link href={`/episodes/${episode.slug}`} className="group block">
      <div className="museum-frame overflow-hidden p-0">
        <div className="flex flex-col gap-0 md:flex-row">
          {/* Thumbnail */}
          <div className="relative aspect-video w-full overflow-hidden md:w-3/5">
            {videoId ? (
              <Image
                src={`https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`}
                alt={episode.title}
                fill
                sizes="(max-width: 768px) 100vw, 60vw"
                placeholder="blur"
                blurDataURL={BLUR_DATA_URL_16_9}
                className="object-cover grayscale transition-all duration-700 group-hover:scale-105 group-hover:grayscale-0"
              />
            ) : (
              <div className="absolute inset-0 bg-black" />
            )}
            <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-t from-black/60 via-black/20 to-transparent">
              <div className="flex h-16 w-16 items-center justify-center border border-primary/30 bg-black/40 backdrop-blur-sm transition-transform group-hover:scale-110">
                <Play className="h-6 w-6 ms-1 text-primary" fill="currentColor" />
              </div>
            </div>
            <div className="absolute bottom-3 start-3 flex items-center gap-1 bg-black/70 px-2 py-1 text-[10px] tracking-wider text-white/70">
              <Clock className="h-3 w-3" />
              <span>{formatDuration(episode.duration_minutes)}</span>
            </div>
          </div>

          {/* Info */}
          <div className="flex flex-1 flex-col justify-center space-y-4 bg-black p-6 md:p-10">
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-bold tracking-[0.2em] text-primary">
                الأكثر مشاهدة
              </span>
              {viewCount && (
                <>
                  <span className="text-primary/20">|</span>
                  <span className="text-[10px] tracking-wider text-muted-foreground/60">{viewCount} مشاهدة</span>
                </>
              )}
            </div>
            <h2 className="museum-font-headline text-2xl leading-tight transition-colors duration-500 group-hover:text-primary md:text-4xl">
              {episode.title}
            </h2>
            <div className="h-px w-12 bg-primary/30" />
            {episode.guest && (
              <p className="text-sm tracking-widest text-muted-foreground">
                مع {episode.guest.name}
              </p>
            )}
            <div className="flex items-center gap-3 text-[10px] tracking-wider text-muted-foreground/60">
              <Calendar className="h-3 w-3" />
              <span>{formatDate(episode.release_date)}</span>
              {episode.season && (
                <>
                  <span className="text-primary/20">|</span>
                  <span>الموسم {episode.season}</span>
                </>
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
    <div className="museum-frame overflow-hidden p-0">
      <div className="flex flex-col md:flex-row">
        <div className="aspect-video w-full animate-pulse bg-white/5 md:w-3/5" />
        <div className="flex-1 space-y-4 bg-black p-6 md:p-10">
          <div className="h-3 w-24 animate-pulse bg-white/5" />
          <div className="h-8 w-3/4 animate-pulse bg-white/5" />
          <div className="h-px w-12 bg-primary/10" />
          <div className="h-4 w-1/3 animate-pulse bg-white/5" />
        </div>
      </div>
    </div>
  )
}

async function EpisodesContent({ searchParams }: { searchParams: Awaited<EpisodesPageProps['searchParams']> }) {
  const sortOrder = searchParams.sort === "oldest" ? "asc" : "desc"
  const isDefaultView = !searchParams.search && !searchParams.category

  // Use cached episodes for default view, uncached for search/filter
  let episodes = isDefaultView
    ? await getCachedPublicEpisodes()
    : await getEpisodes({
        search: searchParams.search,
        category: searchParams.category,
      })

  if (!searchParams.search) {
    episodes = [...episodes].sort((a, b) => {
      const dateA = new Date(a.release_date).getTime()
      const dateB = new Date(b.release_date).getTime()
      return sortOrder === "asc" ? dateA - dateB : dateB - dateA
    })
  }

  if (episodes.length === 0) {
    const suggestions = await getEpisodes({ limit: 3 })

    return (
      <div className="py-16 text-center">
        <p className="museum-font-headline text-xl text-muted-foreground">
          {searchParams.search
            ? `لا توجد نتائج لـ "${searchParams.search}"`
            : "لا توجد حلقات في هذا التصنيف"}
        </p>
        <p className="mt-3 text-xs tracking-wider text-muted-foreground/50">
          جرّب البحث بكلمات مختلفة أو تصفّح الحلقات الأخرى
        </p>
        {suggestions.length > 0 && (
          <div className="mt-12 text-start">
            <p className="mb-6 text-[10px] font-bold tracking-[0.3em] text-primary">
              حلقات قد تعجبك
            </p>
            <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-3">
              {suggestions.map((ep) => (
                <EpisodeCard key={ep.id} episode={ep} />
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  let displayEpisodes = episodes
  if (isDefaultView && sortOrder === "desc") {
    const gemsIds = new Set(getHiddenGems(episodes, 5).map((e) => e.id))
    displayEpisodes = interleaveBoosts(episodes, episodes, { excludeIds: gemsIds })
  }

  const initialEpisodes = displayEpisodes.slice(0, INITIAL_EPISODES)

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
    <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="space-y-3">
          <div className="museum-frame overflow-hidden p-0">
            <div className="aspect-video w-full animate-pulse bg-white/5" />
          </div>
          <div className="h-5 w-3/4 animate-pulse bg-white/5" />
          <div className="h-3 w-1/2 animate-pulse bg-white/5" />
        </div>
      ))}
    </div>
  )
}

async function FiltersWithCounts() {
  const [counts, categories] = await Promise.all([
    getEpisodeCounts(),
    getCategories(),
  ])
  return <EpisodeFilters counts={counts} categories={categories} />
}

export default async function EpisodesPage({ searchParams }: EpisodesPageProps) {
  const resolvedSearchParams = await searchParams
  const showFeatured = !resolvedSearchParams.category && !resolvedSearchParams.search

  return (
    <div className="bg-[#0F0E0D] min-h-screen">
      <div className="mx-auto max-w-7xl px-6 py-12">
        {/* Page header */}
        <header className="mb-16 space-y-4">
          <span className="text-[10px] font-bold tracking-[0.3em] text-primary">
            أرشيف الحوارات
          </span>
          <h1 className="museum-font-headline text-5xl tracking-tight md:text-7xl">
            الحلقات
          </h1>
          <div className="h-px w-20 bg-primary/30" />
        </header>

        {/* Featured Episode */}
        {showFeatured && (
          <div className="mb-16">
            <Suspense fallback={<FeaturedSkeleton />}>
              <FeaturedEpisode />
            </Suspense>
          </div>
        )}

        {/* Continue Watching */}
        <ContinueWatching />

        {/* Hidden Gems */}
        {showFeatured && (
          <Suspense fallback={null}>
            <HiddenGems />
          </Suspense>
        )}

        {/* Filters */}
        <div className="mb-12">
          <Suspense fallback={<div className="h-10 w-full animate-pulse bg-white/5" />}>
            <FiltersWithCounts />
          </Suspense>
        </div>

        {/* Episodes Grid */}
        <Suspense fallback={<EpisodesGridSkeleton />}>
          <EpisodesContent searchParams={resolvedSearchParams} />
        </Suspense>
      </div>
    </div>
  )
}
