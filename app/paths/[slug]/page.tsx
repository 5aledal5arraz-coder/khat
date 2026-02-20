import type { Metadata } from "next"
import Link from "next/link"
import Image from "next/image"
import { notFound } from "next/navigation"
import type { PathSlug, HomeQuote } from "@/types/database"
import { getPathBySlug, getAllPaths } from "@/lib/emotional-paths"
import { getPublishedHomeQuotes } from "@/lib/home-quotes"
import { getEpisodes } from "@/lib/queries/episodes"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Users, Rocket, Heart, Eye, Play, Clock, ArrowRight, ArrowLeft } from "lucide-react"
import { formatDuration, formatDate, getYouTubeId, formatArabicCount } from "@/lib/utils"

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Users,
  Rocket,
  Heart,
  Eye,
}

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const path = await getPathBySlug(slug as PathSlug)
  if (!path) return { title: "المسار غير موجود" }
  return {
    title: `${path.title} — مسارات الاستماع`,
    description: path.subtitle,
  }
}

export default async function PathPage({ params }: Props) {
  const { slug } = await params

  const allPaths = await getAllPaths()
  const validSlugs = allPaths.map((p) => p.slug)
  if (!validSlugs.includes(slug as PathSlug)) {
    notFound()
  }

  const path = await getPathBySlug(slug as PathSlug)
  if (!path) notFound()

  // Fetch episodes that are assigned to this path
  const allEpisodes = await getEpisodes({ limit: 100 })
  const pathEpisodes = allEpisodes.filter((ep) => path.episode_ids.includes(ep.id))

  // Fetch all published quotes
  const allQuotes = await getPublishedHomeQuotes()

  // Manually assigned quotes
  const manualQuotes = allQuotes.filter((q) => path.quote_ids.includes(q.id))

  // Auto-detected quotes: quotes linked to episodes in this path (not already in manual)
  const manualQuoteIds = new Set(manualQuotes.map((q) => q.id))
  const episodeIdSet = new Set(path.episode_ids)
  const autoQuotes = allQuotes.filter(
    (q) => q.episode_id && episodeIdSet.has(q.episode_id) && !manualQuoteIds.has(q.id)
  )

  // Combine and deduplicate
  const allPathQuotes: HomeQuote[] = [...manualQuotes, ...autoQuotes]

  const Icon = iconMap[path.icon] || Heart

  return (
    <div className="container mx-auto px-4 py-12">
      <div className="mx-auto max-w-2xl space-y-8">
        {/* Back link */}
        <Link
          href="/paths"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowRight className="h-4 w-4" />
          جميع المسارات
        </Link>

        {/* Path Header */}
        <div className="flex flex-col items-center gap-4 text-center py-4">
          <div
            className="flex h-20 w-20 items-center justify-center rounded-full"
            style={{ backgroundColor: `${path.color}20` }}
          >
            <span style={{ color: path.color }}><Icon className="h-10 w-10" /></span>
          </div>
          <div>
            <h1 className="text-2xl font-bold md:text-3xl">{path.title}</h1>
            <p className="mt-2 text-muted-foreground">{path.subtitle}</p>
          </div>
          {pathEpisodes.length > 0 && (
            <p className="text-sm text-muted-foreground">
              {formatArabicCount(pathEpisodes.length, "حلقة")}{allPathQuotes.length > 0 ? ` · ${formatArabicCount(allPathQuotes.length, "اقتباس")}` : ""}
            </p>
          )}
        </div>

        {/* Episodes */}
        {pathEpisodes.length > 0 ? (
          <section className="space-y-4">
            <h2 className="text-lg font-semibold">الحلقات</h2>
            <div className="space-y-3">
              {pathEpisodes.map((ep) => (
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
                        <div>
                          <h3 className="text-sm font-semibold line-clamp-2 group-hover:text-primary">
                            {ep.title}
                          </h3>
                          {ep.guest && (
                            <p className="mt-1 text-xs text-muted-foreground">مع {ep.guest.name}</p>
                          )}
                        </div>
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
          </section>
        ) : (
          <div className="rounded-lg border border-dashed p-8 text-center">
            <p className="text-muted-foreground">لم تُضاف حلقات لهذا المسار بعد.</p>
            <Link href="/episodes" className="mt-2 inline-block">
              <Button variant="outline" size="sm" className="gap-2">
                تصفح الحلقات
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        )}

        {/* All Path Quotes (manual + auto from episodes) */}
        {allPathQuotes.length > 0 && (
          <section className="space-y-4">
            <h2 className="text-lg font-semibold">اقتباسات من هذا المسار</h2>
            <div className="space-y-3">
              {allPathQuotes.map((q) => (
                <Link key={q.id} href={`/quotes/${q.id}`}>
                  <Card className="border-accent/30 bg-gradient-to-br from-accent/5 to-transparent transition-all hover:border-accent/50">
                    <CardContent className="p-5">
                      <blockquote className="text-sm leading-relaxed">
                        &ldquo;{q.text}&rdquo;
                      </blockquote>
                      <div className="mt-2 flex items-center gap-2">
                        <p className="text-xs text-muted-foreground">— {q.attribution}</p>
                        {q.episode_title && (
                          <Badge variant="outline" className="text-xs">
                            {q.episode_title}
                          </Badge>
                        )}
                      </div>
                      {q.theme && <Badge variant="outline" className="mt-2">{q.theme}</Badge>}
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
