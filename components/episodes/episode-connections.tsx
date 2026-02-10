import Link from "next/link"
import type { HomeQuote, EmotionalPath, DailyReflection } from "@/types/database"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Users, Rocket, Heart, Eye, Quote, Sparkles, Compass, ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Users,
  Rocket,
  Heart,
  Eye,
}

interface Props {
  homeQuotes: HomeQuote[]
  paths: EmotionalPath[]
  reflections: DailyReflection[]
}

export function EpisodeConnections({ homeQuotes, paths, reflections }: Props) {
  const hasContent = homeQuotes.length > 0 || paths.length > 0 || reflections.length > 0
  if (!hasContent) return null

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">استكشف أكثر</h2>

      {/* Paths that include this episode */}
      {paths.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Compass className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-medium text-muted-foreground">مسارات تتضمن هذه الحلقة</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {paths.map((path) => {
              const Icon = iconMap[path.icon] || Heart
              return (
                <Link key={path.id} href={`/paths/${path.slug}`}>
                  <Badge
                    variant="outline"
                    className="gap-2 px-3 py-1.5 transition-colors hover:border-primary/50 hover:bg-primary/5"
                  >
                    <span style={{ color: path.color }}>
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    {path.title}
                  </Badge>
                </Link>
              )
            })}
          </div>
        </div>
      )}

      {/* Home Quotes from this episode */}
      {homeQuotes.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Quote className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-medium text-muted-foreground">اقتباسات مميزة</h3>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {homeQuotes.map((q) => (
              <Link key={q.id} href={`/quotes/${q.id}`}>
                <Card className="h-full border-accent/20 transition-all hover:border-accent/50 hover:bg-accent/5">
                  <CardContent className="p-4">
                    <blockquote className="text-sm leading-relaxed line-clamp-3">
                      &ldquo;{q.text}&rdquo;
                    </blockquote>
                    <p className="mt-2 text-xs text-muted-foreground">— {q.attribution}</p>
                    {q.theme && <Badge variant="outline" className="mt-2 text-xs">{q.theme}</Badge>}
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Reflections linked to this episode */}
      {reflections.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-medium text-muted-foreground">تأملات مرتبطة</h3>
          </div>
          {reflections.map((ref) => (
            <Card key={ref.id} className="border-primary/10 bg-gradient-to-br from-primary/5 to-transparent">
              <CardContent className="p-4 space-y-2">
                <p className="text-sm font-medium">&ldquo;{ref.short_quote}&rdquo;</p>
                <p className="text-xs text-muted-foreground line-clamp-2">{ref.reflection}</p>
                <div className="rounded-md border border-primary/10 bg-primary/5 p-2">
                  <p className="text-xs text-primary">❓ {ref.thinking_question}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
