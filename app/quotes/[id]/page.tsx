import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { getHomeQuoteById, getPublishedHomeQuotes } from "@/lib/content/home-quotes"
import { getEpisodeBySlug } from "@/lib/queries/episodes"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ArrowLeft, ArrowRight, Clock } from "lucide-react"
import { formatDuration, formatDate } from "@/lib/utils"
import { EpisodeThumb } from "@/components/media/episode-thumb"

interface Props {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const quote = await getHomeQuoteById(id)
  if (!quote || quote.status !== "published") {
    // Trigger a real 404 response (not a soft-404 body with HTTP 200).
    notFound()
  }

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
          className="inline-flex items-center gap-2 text-caption text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowRight className="h-4 w-4" />
          العودة للرئيسية
        </Link>

        {/* Main Quote */}
        <section className="space-y-6 text-center py-8">
          <blockquote className="text-subhead font-bold md:text-heading">
            &ldquo;{quote.text}&rdquo;
          </blockquote>

          <p className="text-lead text-muted-foreground">— {quote.attribution}</p>

          {quote.theme && (
            <Badge variant="outline" className="text-caption">{quote.theme}</Badge>
          )}
        </section>

        {/* Rich Episode Card */}
        {episode && (
          <Link href={`/episodes/${episode.slug}`}>
            <Card className="group overflow-hidden rounded-2xl border-primary/20 transition-all hover:border-primary/50 hover:shadow-lg">
              {/* The frame carries nothing. It used to carry a black gradient,
                  an eyebrow, the full title, the guest, the duration, the date
                  AND a 40px play button — all of it laid over a poster whose
                  own title is burned into the artwork, and none of it matching
                  any other card on the site. It reads below the image now,
                  where it is legible and where it cannot cover anything. */}
              <div className="relative aspect-video overflow-hidden bg-secondary">
                <EpisodeThumb
                  ep={episode}
                  sizes="(max-width: 768px) 100vw, 768px"
                  className="transition-transform group-hover:scale-105"
                />
              </div>
              <CardContent className="p-4">
                <p className="text-micro font-medium text-muted-foreground">
                  شاهد المحادثة كاملة
                </p>
                <h3 className="mt-1 text-lead font-bold text-foreground">{episode.title}</h3>
                {episode.guest && (
                  <p className="mt-1 text-caption text-muted-foreground">
                    مع {episode.guest.name}
                  </p>
                )}
                <div className="mt-2 flex items-center gap-3 text-micro text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatDuration(episode.duration_minutes)}
                  </span>
                  <span>{formatDate(episode.release_date)}</span>
                </div>
              </CardContent>
            </Card>
          </Link>
        )}

        {/* Fallback: simple episode link if no full episode data */}
        {!episode && quote.episode_slug && quote.episode_title && (
          <Card className="border-primary/20">
            <CardContent className="flex items-center justify-between p-6">
              <div>
                <p className="text-caption text-muted-foreground">شاهد المحادثة كاملة</p>
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
            <h2 className="text-lead font-semibold">اقتباسات مشابهة</h2>
            <div className="space-y-3">
              {related.map((q) => (
                <Link key={q.id} href={`/quotes/${q.id}`}>
                  <Card className="transition-all hover:border-primary/50">
                    <CardContent className="p-5">
                      <blockquote className="text-caption">
                        &ldquo;{q.text}&rdquo;
                      </blockquote>
                      <p className="mt-2 text-micro text-muted-foreground">— {q.attribution}</p>
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
