import Link from "next/link"
import type { HomeQuote } from "@/types/database"
import { Button } from "@/components/ui/button"
import { ArrowLeft, Play } from "lucide-react"

interface Props {
  quote: HomeQuote | null
}

export function HeroPauseMoment({ quote }: Props) {
  return (
    <section className="relative flex min-h-[60vh] flex-col items-center justify-center px-4 py-16 text-center">
      {/* Background subtle gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-transparent" />

      <div className="relative z-10 mx-auto max-w-2xl space-y-6">
        {/* Small label */}
        <p className="text-sm font-medium tracking-wide text-muted-foreground">
          توقّف لحظة
        </p>

        {quote ? (
          <>
            {/* The quote */}
            <blockquote className="text-2xl font-bold leading-relaxed md:text-3xl lg:text-4xl">
              &ldquo;{quote.text}&rdquo;
            </blockquote>

            {/* Attribution */}
            <p className="text-base text-muted-foreground">
              — {quote.attribution}
            </p>

            {/* CTAs — never a dead end */}
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              {quote.episode_slug && (
                <Link href={`/episodes/${quote.episode_slug}`}>
                  <Button variant="outline" size="lg" className="gap-2">
                    كمّل الفكرة
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                </Link>
              )}
              {quote.episode_slug && quote.episode_title && (
                <Link href={`/episodes/${quote.episode_slug}`}>
                  <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground">
                    <Play className="h-4 w-4" />
                    {quote.episode_title}
                  </Button>
                </Link>
              )}
              {!quote.episode_slug && (
                <Link href="/episodes">
                  <Button variant="outline" size="lg" className="gap-2">
                    تصفّح الحلقات
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                </Link>
              )}
            </div>
          </>
        ) : (
          <>
            {/* Fallback when no quotes are configured */}
            <h1 className="text-2xl font-bold leading-relaxed md:text-3xl lg:text-4xl">
              بودكاست يستكشف القصص الإنسانية
            </h1>
            <p className="text-base text-muted-foreground">
              حوارات عميقة مع ضيوف ملهمين عن الحياة، الإيمان، والمعنى
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <Link href="/episodes">
                <Button variant="outline" size="lg" className="gap-2">
                  استكشف الحلقات
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          </>
        )}
      </div>
    </section>
  )
}
