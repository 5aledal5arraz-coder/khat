import Link from "next/link"
import Image from "next/image"
import type { Episode, Guest } from "@/types/database"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { GuestAvatar } from "@/components/guests/guest-avatar"
import { Play, Clock, ArrowLeft } from "lucide-react"
import { formatDuration, formatDate, getYouTubeId } from "@/lib/utils"

interface Props {
  episodes: Episode[]
  guests: Guest[]
}

export function DeepContentSection({ episodes, guests }: Props) {
  const featured = episodes[0]
  const older = episodes.slice(1, 4)
  const featuredGuests = guests.slice(0, 6)

  return (
    <section className="py-12 space-y-8">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">حلقات تستحق الاستماع</h2>
        <Link href="/episodes" className="text-sm text-primary hover:underline">
          عرض الكل
        </Link>
      </div>

      {/* Featured Episode */}
      {featured && (
        <Link href={`/episodes/${featured.slug}`}>
          <Card className="group overflow-hidden transition-all hover:border-primary/50 hover:shadow-lg">
            <div className="relative aspect-video overflow-hidden">
              <Image
                src={`https://img.youtube.com/vi/${getYouTubeId(featured.youtube_url)}/maxresdefault.jpg`}
                alt={featured.title}
                fill
                className="object-cover transition-transform group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
              <div className="absolute bottom-4 start-4 end-4">
                <Badge className="mb-2 bg-primary text-primary-foreground">مميزة</Badge>
                <h3 className="text-lg font-bold text-white md:text-xl">
                  {featured.title}
                </h3>
                {featured.guest && (
                  <p className="mt-1 text-sm text-white/80">مع {featured.guest.name}</p>
                )}
                <div className="mt-2 flex items-center gap-3 text-xs text-white/70">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatDuration(featured.duration_minutes)}
                  </span>
                  <span>{formatDate(featured.release_date)}</span>
                </div>
              </div>
              <div className="absolute bottom-4 end-4">
                <Button size="icon" variant="secondary" className="h-10 w-10 rounded-full">
                  <Play className="h-5 w-5" />
                </Button>
              </div>
            </div>
          </Card>
        </Link>
      )}

      {/* Older Episodes */}
      {older.length > 0 && (
        <div className="space-y-3">
          {older.map((ep) => (
            <Link key={ep.id} href={`/episodes/${ep.slug}`}>
              <Card className="group transition-all hover:border-primary/50">
                <div className="flex gap-4 p-4">
                  <div className="relative h-20 w-32 shrink-0 overflow-hidden rounded-lg bg-muted">
                    <Image
                      src={`https://img.youtube.com/vi/${getYouTubeId(ep.youtube_url)}/mqdefault.jpg`}
                      alt={ep.title}
                      fill
                      className="object-cover"
                    />
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
          ))}
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
                  {guest.name.split(" ")[0]}
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
