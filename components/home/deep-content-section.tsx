import Link from "next/link"
import Image from "next/image"
import type { Episode, Guest } from "@/types/database"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { GuestAvatar } from "@/components/guests/guest-avatar"
import { FeaturedEpisodeCard } from "@/components/home/featured-episode-card"
import { Play, Clock, ArrowLeft } from "lucide-react"
import { formatDuration, formatDate, getYouTubeId } from "@/lib/utils"

interface Props {
  episodes: Episode[]
  guests: Guest[]
  recommendationReason?: string | null
  excludeEpisodeIds?: Set<string>
}

export function DeepContentSection({ episodes, guests, recommendationReason, excludeEpisodeIds }: Props) {
  // Filter out episodes already shown in recommendation sections
  const filtered = excludeEpisodeIds?.size
    ? episodes.filter((ep) => !excludeEpisodeIds.has(ep.id))
    : episodes

  const featured = filtered[0]
  const older = filtered.slice(1, 4)
  const featuredGuests = guests.slice(0, 6)

  return (
    <section className="py-12 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">حلقات تستحق الاستماع</h2>
          {recommendationReason && (
            <p className="text-sm text-muted-foreground mt-1">{recommendationReason}</p>
          )}
        </div>
        <Link href="/episodes" className="text-sm text-primary hover:underline">
          عرض الكل
        </Link>
      </div>

      {/* Featured Episode — expands inline */}
      {featured && <FeaturedEpisodeCard episode={featured} />}

      {/* Older Episodes */}
      {older.length > 0 && (
        <div className="space-y-3">
          {older.map((ep) => {
            const videoId = getYouTubeId(ep.youtube_url)
            return (
              <Link key={ep.id} href={`/episodes/${ep.slug}`}>
                <Card className="group transition-all hover:border-primary/50">
                  <div className="flex gap-4 p-4">
                    <div className="relative h-20 w-32 shrink-0 overflow-hidden rounded-lg bg-muted">
                      {videoId ? (
                        <Image
                          src={`https://img.youtube.com/vi/${videoId}/mqdefault.jpg`}
                          alt={ep.title}
                          fill
                          className="object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <Play className="h-6 w-6 text-muted-foreground/40" />
                        </div>
                      )}
                      <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition-opacity group-hover:opacity-100">
                        <Play className="h-6 w-6 text-white" />
                      </div>
                    </div>
                    <div className="flex flex-1 flex-col justify-between">
                      <h4 className="text-sm font-semibold line-clamp-2 group-hover:text-primary">
                        {ep.title}
                      </h4>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDuration(ep.duration_minutes)}
                        </span>
                        <span>{formatDate(ep.release_date)}</span>
                      </div>
                    </div>
                  </div>
                </Card>
              </Link>
            )
          })}
        </div>
      )}

      {/* Notable Guests */}
      {featuredGuests.length > 0 && (
        <div>
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-medium text-muted-foreground">ضيوف مميزون</h3>
            <Link href="/guests" className="text-xs text-primary hover:underline">عرض الكل</Link>
          </div>
          <div className="flex gap-4 overflow-x-auto py-2 scrollbar-hide">
            {featuredGuests.map((guest) => (
              <Link
                key={guest.id}
                href={`/guests/${guest.slug}`}
                className="group flex shrink-0 flex-col items-center gap-2"
              >
                <GuestAvatar
                  name={guest.name}
                  slug={guest.slug}
                  photoUrl={guest.photo_url}
                  size="lg"
                  showBorder
                  className="transition-all group-hover:ring-primary group-hover:shadow-lg group-hover:shadow-primary/20"
                />
                <span className="max-w-[80px] truncate text-center text-xs text-muted-foreground group-hover:text-foreground transition-colors">
                  {guest.name?.split(" ")[0] || "ضيف"}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* See All Episodes */}
      <div className="text-center">
        <Link href="/episodes">
          <Button variant="outline" size="lg" className="gap-2">
            استعرض جميع الحلقات
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
      </div>
    </section>
  )
}
