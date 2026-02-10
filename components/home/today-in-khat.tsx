import Link from "next/link"
import type { DailyReflection } from "@/types/database"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ArrowLeft, Sparkles, Play, Quote, Compass } from "lucide-react"

interface Props {
  reflection: DailyReflection | null
}

export function TodayInKhat({ reflection }: Props) {
  if (!reflection) return null

  const hasEpisode = !!reflection.episode_slug
  const hasQuote = !!reflection.quote_id
  const hasPath = !!reflection.path_slug

  return (
    <section className="py-12">
      <div className="mb-6 flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-primary" />
        <h2 className="text-xl font-bold">اليوم في خط</h2>
      </div>

      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 via-transparent to-accent/5">
        <CardContent className="space-y-6 p-6 md:p-8">
          {/* Short quote */}
          <blockquote className="text-lg font-semibold leading-relaxed md:text-xl">
            &ldquo;{reflection.short_quote}&rdquo;
          </blockquote>

          {reflection.attribution && (
            <p className="text-sm text-muted-foreground">— {reflection.attribution}</p>
          )}

          {/* Reflection text */}
          <p className="text-sm leading-relaxed text-muted-foreground md:text-base">
            {reflection.reflection}
          </p>

          {/* Thinking question */}
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
            <p className="text-sm font-medium text-primary">سؤال للتفكير</p>
            <p className="mt-1 text-sm leading-relaxed">
              {reflection.thinking_question}
            </p>
          </div>

          {/* Contextual CTAs based on linked content */}
          {(hasEpisode || hasQuote || hasPath) && (
            <div className="flex flex-wrap gap-3 pt-2">
              {hasEpisode && (
                <Link href={`/episodes/${reflection.episode_slug}`}>
                  <Button variant="outline" size="sm" className="gap-2">
                    <Play className="h-4 w-4" />
                    {reflection.episode_title || "استمع للحلقة"}
                  </Button>
                </Link>
              )}
              {hasQuote && (
                <Link href={`/quotes/${reflection.quote_id}`}>
                  <Button variant="ghost" size="sm" className="gap-2">
                    <Quote className="h-4 w-4" />
                    اقرأ الاقتباس
                  </Button>
                </Link>
              )}
              {hasPath && (
                <Link href={`/paths/${reflection.path_slug}`}>
                  <Button variant="ghost" size="sm" className="gap-2">
                    <Compass className="h-4 w-4" />
                    {reflection.path_title || "استكشف المسار"}
                  </Button>
                </Link>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  )
}
