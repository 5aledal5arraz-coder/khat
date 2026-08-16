"use client"

import { useMemo } from "react"
import { cn } from "@/lib/utils"
import { usePlayer } from "./episode-player-context"
import { formatStoryTime } from "@/lib/stories/story"
import { KhatDiamond } from "@/components/brand/khat-icon"

/**
 * A handful of the episode's own sentences, each one playable.
 *
 * WHY HERE — between the chapter index and the full text. The transcript is
 * 19,683 words and collapsed behind a button; nothing about that button tells a
 * visitor whether the conversation is worth opening. These lines do. They are
 * the taste before the meal: read six sentences in the guest's own voice, press
 * one, hear him say it, and the button below stops being a wall.
 *
 * WHY VERBATIM IS NOT A DETAIL. What this replaces was generated FROM a summary
 * rather than taken FROM the conversation — «تجربة الأسر علمتني قيمة الحياة
 * والحرية» under صلاح الغزالي's name appears nowhere in his 19,683 words, and
 * that page was the second Google result for his name. Every line here was
 * matched back to the transcript before it was allowed into the file, and the
 * timestamp beside it is the proof a reader can check for themselves in one tap.
 */

export interface QuoteItem {
  text: string
  start: number
  speaker: string
}

/** Six. Enough to show range, few enough to read standing up. */
const SHOWN = 6

export function EpisodeStoryQuotes({ quotes }: { quotes: QuoteItem[] }) {
  const { seekTo } = usePlayer()

  // Spread across the episode rather than the first six, which would all come
  // from the opening minutes and make a three-hour conversation look like one
  // scene. The file is already in chronological order.
  const shown = useMemo(() => {
    if (quotes.length <= SHOWN) return quotes
    const step = quotes.length / SHOWN
    return Array.from({ length: SHOWN }, (_, i) => quotes[Math.floor(i * step)])
  }, [quotes])

  if (shown.length === 0) return null

  return (
    <section id="sec-story-quotes" className="scroll-mt-24">
      <div className="mb-4 flex items-center gap-2">
        <KhatDiamond size={11} className="text-accent" />
        <h2 className="text-lead font-semibold">من الحلقة، بصوته</h2>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {shown.map((q, i) => (
          <button
            key={`${q.start}-${i}`}
            type="button"
            onClick={() => seekTo(q.start)}
            aria-label={`شغّل من ${formatStoryTime(q.start)}`}
            className={cn(
              "group flex h-full flex-col rounded-2xl border border-border bg-card p-4 text-start transition-all",
              "hover:border-primary/40 hover:shadow-[0_2px_8px_hsl(var(--primary)/0.06)]",
            )}
          >
            <p className="text-pretty text-body leading-prose text-foreground">
              {/* Typographic quotation marks, not the straight ones: this is a
                  person being quoted, and the page should look like it knows. */}
              «{q.text}»
            </p>
            <span className="mt-3 inline-flex items-center gap-1.5 font-mono text-micro tabular-nums text-muted-foreground transition-colors group-hover:text-accent">
              {formatStoryTime(q.start)}
              <span className="font-sans">— اسمعها</span>
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}
