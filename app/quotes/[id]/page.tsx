import type { Metadata } from "next"
import Link from "next/link"
import Image from "next/image"
import { notFound } from "next/navigation"
import { getHomeQuoteById, getPublishedHomeQuotes } from "@/lib/home-quotes"
import { getEpisodeBySlug } from "@/lib/queries/episodes"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ArrowLeft, ArrowRight, Play, Clock } from "lucide-react"
import { formatDuration, formatDate, getYouTubeId } from "@/lib/utils"

interface Props {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const quote = await getHomeQuoteById(id)
  if (!quote) return { title: "اقتباس" }

  const text = quote.text.length > 100 ? quote.text.slice(0, 100) + "…" : quote.text
  return {
    title: `${text} — ${quote.attribution || "خط"}`,
    description: quote.text,
    openGraph: {
      title: `اقتباس — ${quote.attribution || "خط"}`,
      description: quote.text,
    },
  }
}

export default async function QuotePage({ params }: Props) {
  const { id } = await params
  const quote = await getHomeQuoteById(id)

  if (!quote || quote.status !== "published") {
    notFound()
  }

  // Fetch the actual episode if linked
  const episode = quote.episode_slug
    ? await getEpisodeBySlug(quote.episode_slug)
    : null

  // Get related quotes by theme
  const allPublished = await getPublishedHomeQuotes()
  const related = allPublished
    .filter((q) => q.id !== quote.id && q.theme && q.theme === quote.theme)
    .slice(0, 3)

  return (
    <div className="container mx-auto px-4 py-12">
      <div className="mx-auto max-w-2xl space-y-8">
        {/* Back link */}
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowRight className="h-4 w-4" />
          العودة للرئيسية
        </Link>

        {/* Main Quote */}
        <section className="space-y-6 text-center py-8">
          <blockquote className="text-2xl font-bold leading-relaxed md:text-3xl">
            &ldquo;{quote.text}&rdquo;
          </blockquote>

          <p className="text-lg text-muted-foreground">— {quote.attribution}</p>

          {quote.theme && (
            <Badge variant="outline" className="text-sm">{quote.theme}</Badge>
          )}
        </section>

        {/* Rich Episode Card */}
        {episode && (
          <Link href={`/episodes/${episode.slug}`}>
            <Card className="group overflow-hidden border-primary/20 transition-all hover:border-primary/50 hover:shadow-lg">
              <div className="relative aspect-video overflow-hidden">
                <Image
                  src={`https://img.youtube.com/vi/${getYouTubeId(episode.youtube_url)}/maxresdefault.jpg`}
                  alt={episode.title}
                  fill
                  className="object-cover transition-transform group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
                <div className="absolute bottom-4 start-4 end-4">
                  <p className="mb-1 text-xs font-medium text-white/70">شاهد المحادثة كاملة</p>
                  <h3 className="text-lg font-bold text-white">{episode.title}</h3>
                  {episode.guest && (
                    <p className="mt-1 text-sm text-white/80">مع {episode.guest.name}</p>
                  )}
                  <div className="mt-2 flex items-center gap-3 text-xs text-white/70">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatDuration(episode.duration_minutes)}
                    </span>
                    <span>{formatDate(episode.release_date)}</span>
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

        {/* Fallback: simple episode link if no full episode data */}
        {!episode && quote.episode_slug && quote.episode_title && (
          <Card className="border-primary/20">
            <CardContent className="flex items-center justify-between p-6">
              <div>
                <p className="text-sm text-muted-foreground">شاهد المحادثة كاملة</p>
                <p className="mt-1 font-semibold">{quote.episode_title}</p>
              </div>
              <Link href={`/episodes/${quote.episode_slug}`}>
                <Button className="gap-2">
                  شاهد الآن
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}

        {/* Related Quotes */}
        {related.length > 0 && (
          <section className="space-y-4">
            <h2 className="text-lg font-semibold">اقتباسات مشابهة</h2>
            <div className="space-y-3">
              {related.map((q) => (
                <Link key={q.id} href={`/quotes/${q.id}`}>
                  <Card className="transition-all hover:border-primary/50">
                    <CardContent className="p-5">
                      <blockquote className="text-sm leading-relaxed">
                        &ldquo;{q.text}&rdquo;
                      </blockquote>
                      <p className="mt-2 text-xs text-muted-foreground">— {q.attribution}</p>
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
