import { Metadata } from "next"
import { notFound } from "next/navigation"
import { getTopicBySlug, getEpisodesForTopic } from "@/lib/episodes/episode-graph"
import { getCachedPublicEpisodes } from "@/lib/cache"
import { EpisodeCard } from "@/components/episodes/episode-card"

// The taxonomy is admin-driven; render on every request.
export const dynamic = "force-dynamic"

interface TopicPageProps {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: TopicPageProps): Promise<Metadata> {
  const { slug } = await params
  const topic = await getTopicBySlug(decodeURIComponent(slug))
  if (!topic) notFound()
  return {
    title: `${topic.name} — خط بودكاست`,
    description: `كل حلقات خط بودكاست عن ${topic.name}`,
    alternates: { canonical: `https://khatpodcast.com/topics/${topic.slug}` },
  }
}

export default async function TopicPage({ params }: TopicPageProps) {
  const { slug } = await params
  const topic = await getTopicBySlug(decodeURIComponent(slug))
  if (!topic) notFound()

  const [episodeIds, allEpisodes] = await Promise.all([
    getEpisodesForTopic(topic.id),
    getCachedPublicEpisodes(),
  ])

  // Map ids → visible public episodes (drops hidden/unpublished).
  const idSet = new Set(episodeIds)
  const episodes = allEpisodes.filter((e) => idSet.has(e.id))

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mx-auto max-w-5xl">
        <header className="mb-8">
          <p className="text-sm text-muted-foreground">موضوع</p>
          <h1 className="mt-1 text-3xl font-bold">{topic.name}</h1>
          <p className="mt-2 text-muted-foreground">
            {episodes.length > 0
              ? `${episodes.length} حلقة عن ${topic.name}`
              : `لا توجد حلقات منشورة عن ${topic.name} بعد`}
          </p>
        </header>

        {episodes.length > 0 && (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {episodes.map((episode) => (
              <EpisodeCard key={episode.id} episode={episode} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
