import { Suspense } from "react"
import { Metadata } from "next"
import { getEpisodes, getTopics, getGuests } from "@/lib/supabase/queries"
import { EpisodeCard } from "@/components/episodes/episode-card"
import { EpisodeFilters } from "@/components/episodes/episode-filters"
import { Skeleton } from "@/components/ui/skeleton"

export const metadata: Metadata = {
  title: "الحلقات",
  description: "استعرض جميع حلقات بودكاست خط",
}

interface EpisodesPageProps {
  searchParams: Promise<{
    search?: string
    topic?: string
    guest?: string
    season?: string
  }>
}

async function EpisodesContent({ searchParams }: { searchParams: Awaited<EpisodesPageProps['searchParams']> }) {
  const episodes = await getEpisodes({
    search: searchParams.search,
    topicSlug: searchParams.topic,
    guestSlug: searchParams.guest,
    season: searchParams.season ? parseInt(searchParams.season) : undefined,
  })

  if (episodes.length === 0) {
    return (
      <div className="py-12 text-center">
        <p className="text-lg text-muted-foreground">
          لا توجد حلقات مطابقة للبحث
        </p>
      </div>
    )
  }

  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {episodes.map((episode) => (
        <EpisodeCard key={episode.id} episode={episode} />
      ))}
    </div>
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

export default async function EpisodesPage({ searchParams }: EpisodesPageProps) {
  const [topics, guests] = await Promise.all([
    getTopics(),
    getGuests(),
  ])
  const resolvedSearchParams = await searchParams

  // Get unique seasons from episodes (simplified - in real app would query distinct seasons)
  const seasons = [1, 2, 3]

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">الحلقات</h1>
        <p className="mt-2 text-muted-foreground">
          استكشف جميع حلقات البودكاست
        </p>
      </div>

      <div className="mb-8">
        <EpisodeFilters topics={topics} guests={guests} seasons={seasons} />
      </div>

      <Suspense fallback={<EpisodesGridSkeleton />}>
        <EpisodesContent searchParams={resolvedSearchParams} />
      </Suspense>
    </div>
  )
}
