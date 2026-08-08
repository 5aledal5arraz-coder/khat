import { formatArabicCount } from "@/lib/shared/formatters"
import { Metadata } from "next"
import { notFound } from "next/navigation"
import { getTopicBySlug, getEpisodesForTopic } from "@/lib/episodes/episode-graph"
import { getCachedPublicEpisodes } from "@/lib/cache"
import { EpisodePosterCard } from "@/components/episodes/episode-poster-card"

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

  // MEASUREMENTS MATCH /episodes AND /guests. This page shipped with four of
  // its own — `container px-4` + `max-w-5xl` (1024px against their 1152px),
  // `gap-6` against their `gap-5`, and a 32px h1 where they use 44px — so the
  // SAME EpisodePosterCard rendered 325px wide here and 370px there, decided
  // only by which page you arrived from. /guests carries a comment recording
  // that the 32-vs-44 h1 gap was found and fixed once already between those
  // two; this page reintroduced it.
  return (
    <div className="px-6 py-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8">
          <p className="text-caption text-muted-foreground">موضوع</p>
          <h1 className="mt-1 text-heading font-bold sm:text-title">{topic.name}</h1>
          <p className="mt-2 text-muted-foreground">
            {episodes.length > 0
              ? // «9 حلقة» is broken Arabic — 3..10 takes the plural («٩ حلقات»), and 2
                // takes the dual («حلقتان»). `formatArabicCount` already handles all
                // four cases and is what /guests uses; this page had hand-rolled the
                // string instead, which is also the thing CLAUDE.md says not to do —
                // formatting lives in lib/shared/formatters.ts and nowhere else.
                `${formatArabicCount(episodes.length, "حلقة")} عن ${topic.name}`
              : `لا توجد حلقات منشورة عن ${topic.name} بعد`}
          </p>
        </header>

        {episodes.length > 0 && (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {episodes.map((episode) => (
              <EpisodePosterCard key={episode.id} ep={episode} showDate />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
