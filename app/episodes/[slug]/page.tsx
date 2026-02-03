import { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { getEpisodeBySlug, getRelatedEpisodes } from "@/lib/supabase/queries"
import { YouTubeEmbed } from "@/components/episodes/youtube-embed"
import { TimestampList } from "@/components/episodes/timestamp-list"
import { ResourcesList } from "@/components/episodes/resources-list"
import { QuoteCard } from "@/components/quotes/quote-card"
import { EpisodeCard } from "@/components/episodes/episode-card"
import { EpisodeActions } from "@/components/episodes/episode-actions"
import { Badge } from "@/components/ui/badge"
import { Calendar, Clock, User } from "lucide-react"
import { formatDate, formatDuration } from "@/lib/utils"

interface EpisodePageProps {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: EpisodePageProps): Promise<Metadata> {
  const { slug } = await params
  const episode = await getEpisodeBySlug(slug)

  if (!episode) {
    return { title: "الحلقة غير موجودة" }
  }

  return {
    title: episode.title,
    description: episode.summary || `حلقة من بودكاست خط مع ${episode.guest?.name || "ضيف مميز"}`,
    openGraph: {
      title: episode.title,
      description: episode.summary || undefined,
      type: "article",
    },
  }
}

export default async function EpisodePage({ params }: EpisodePageProps) {
  const { slug } = await params
  const episode = await getEpisodeBySlug(slug)

  if (!episode) {
    notFound()
  }

  const relatedEpisodes = await getRelatedEpisodes(
    episode.id,
    episode.topics.map(t => t.id)
  )

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mx-auto max-w-4xl">
        {/* Video */}
        <YouTubeEmbed url={episode.youtube_url} title={episode.title} />

        {/* Episode Info */}
        <div className="mt-6 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <h1 className="text-3xl font-bold">{episode.title}</h1>
            <EpisodeActions
              episode={{
                id: episode.id,
                slug: episode.slug,
                title: episode.title,
                guest: episode.guest,
              }}
              variant="outline"
              showLabels
              className="flex shrink-0 gap-2"
            />
          </div>

          <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            {episode.guest && (
              <Link
                href={`/guests/${episode.guest.slug}`}
                className="flex items-center gap-1 hover:text-foreground"
              >
                <User className="h-4 w-4" />
                <span>{episode.guest.name}</span>
              </Link>
            )}
            <div className="flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              <span>{formatDate(episode.release_date)}</span>
            </div>
            <div className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              <span>{formatDuration(episode.duration_minutes)}</span>
            </div>
            {episode.season && (
              <span>الموسم {episode.season}</span>
            )}
          </div>

          {/* Topics */}
          {episode.topics.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {episode.topics.map((topic) => (
                <Link key={topic.id} href={`/episodes?topic=${topic.slug}`}>
                  <Badge variant="secondary">{topic.name}</Badge>
                </Link>
              ))}
            </div>
          )}

          {/* Summary */}
          {episode.summary && (
            <div className="rounded-lg bg-muted/50 p-4">
              <h2 className="mb-2 font-semibold">نبذة عن الحلقة</h2>
              <p className="leading-relaxed text-muted-foreground">
                {episode.summary}
              </p>
            </div>
          )}

          {/* Key Takeaways */}
          {episode.key_takeaways && episode.key_takeaways.length > 0 && (
            <div className="rounded-lg border p-4">
              <h2 className="mb-3 font-semibold">أهم النقاط</h2>
              <ul className="space-y-2">
                {episode.key_takeaways.map((takeaway, index) => (
                  <li key={index} className="flex gap-2">
                    <span className="text-primary">•</span>
                    <span>{takeaway}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Timestamps */}
          {episode.timestamps.length > 0 && (
            <div className="rounded-lg border p-4">
              <TimestampList
                timestamps={episode.timestamps}
                youtubeUrl={episode.youtube_url}
                episodeTitle={episode.title}
              />
            </div>
          )}

          {/* Quotes */}
          {episode.quotes.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold">اقتباسات من الحلقة</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {episode.quotes.map((quote) => (
                  <QuoteCard
                    key={quote.id}
                    quote={{ ...quote, guest: episode.guest }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Resources */}
          {episode.resources.length > 0 && (
            <div className="rounded-lg border p-4">
              <ResourcesList resources={episode.resources} />
            </div>
          )}

          {/* Related Episodes */}
          {relatedEpisodes.length > 0 && (
            <div className="space-y-4 pt-8">
              <h2 className="text-xl font-semibold">حلقات ذات صلة</h2>
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {relatedEpisodes.map((relatedEpisode) => (
                  <EpisodeCard key={relatedEpisode.id} episode={relatedEpisode} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
