"use client"

import { useEffect, useRef, useState } from "react"

interface AtharCardProps {
  text: string
  guestName: string
  episodeDate?: string | null
  /** Compact mode for admin card previews */
  compact?: boolean
}

export function AtharCard({
  text,
  guestName,
  episodeDate,
  compact = false,
}: AtharCardProps) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(compact)

  useEffect(() => {
    if (compact) return
    const el = cardRef.current
    if (!el) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { threshold: 0.15 }
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [compact])

  const [formattedDate, setFormattedDate] = useState<string | null>(null)

  useEffect(() => {
    if (!episodeDate) return
    try {
      const d = new Date(episodeDate)
      setFormattedDate(`${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`)
    } catch {
      setFormattedDate(null)
    }
  }, [episodeDate])

  if (compact) {
    return (
      <div
        className="relative overflow-hidden rounded-xl border border-primary/15 bg-[radial-gradient(ellipse_at_30%_20%,hsl(40_30%_96%)_0%,hsl(35_25%_95%)_50%,hsl(30_20%_93%)_100%)] dark:bg-[radial-gradient(ellipse_at_30%_20%,hsl(35_20%_12%)_0%,hsl(25_15%_10%)_50%,hsl(220_20%_9%)_100%)]"
      >
        {/* Top gold accent line */}
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-l from-transparent via-primary/25 to-transparent" />

        {/* Quotation mark watermark */}
        <span
          className="pointer-events-none absolute -top-3 end-2 select-none font-serif text-5xl leading-none text-primary/[0.07]"
          aria-hidden="true"
        >
          &ldquo;
        </span>

        <div className="relative px-3.5 py-2.5">
          <div className="mb-1.5 flex items-center gap-1.5">
            <span className="text-[10px] font-semibold text-primary/60">
              أثر
            </span>
          </div>
          <p
            className="line-clamp-2 text-xs leading-relaxed text-stone-700 dark:text-[hsl(40_30%_85%)]"
            dir="auto"
          >
            {text}
          </p>
          <p className="mt-2 text-[10px] text-stone-500 dark:text-[hsl(40_20%_50%)]">
            — {guestName}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div
      ref={cardRef}
      className={`transition-all duration-[1200ms] ease-out ${
        visible
          ? "translate-y-0 opacity-100"
          : "translate-y-6 opacity-0"
      }`}
    >
      {/* Section label */}
      <div className="mb-4">
        <p className="text-sm font-medium tracking-wide text-primary/80">
          أثر الضيف
        </p>
        <p className="mt-0.5 text-[11px] text-muted-foreground/50">
          كُتب بعد الحوار
        </p>
      </div>

      {/* Manuscript card */}
      <div
        className="relative overflow-hidden rounded-2xl border border-primary/15 shadow-xl shadow-black/15 bg-[radial-gradient(ellipse_at_30%_20%,hsl(40_30%_96%)_0%,hsl(35_25%_95%)_50%,hsl(30_20%_93%)_100%)] dark:bg-[radial-gradient(ellipse_at_30%_20%,hsl(35_20%_12%)_0%,hsl(25_15%_10%)_50%,hsl(220_20%_9%)_100%)]"
      >
        {/* Subtle paper grain overlay */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.025]"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
          }}
        />

        {/* Top gold accent line */}
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-l from-transparent via-primary/30 to-transparent" />

        {/* Decorative quotation mark watermark */}
        <span
          className="pointer-events-none absolute -top-6 end-6 select-none font-serif text-[10rem] leading-none text-primary/[0.06]"
          aria-hidden="true"
        >
          &ldquo;
        </span>

        {/* Content */}
        <div className="relative px-8 pb-8 pt-10 sm:px-12 sm:pb-10 sm:pt-14">
          <blockquote
            className="text-lg leading-[2.1] sm:text-xl sm:leading-[2.1] text-stone-800 dark:text-[hsl(40_30%_85%)]"
            dir="auto"
          >
            {text}
          </blockquote>

          {/* Signature */}
          <div className="mt-8 border-t border-primary/10 pt-5">
            <p className="text-sm font-medium text-stone-600 dark:text-[hsl(40_20%_65%)]">
              — {guestName}
            </p>
            {formattedDate && (
              <p className="mt-1 text-[11px] text-muted-foreground/40">
                {formattedDate}
              </p>
            )}
          </div>
        </div>

        {/* Bottom gold accent line */}
        <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-l from-transparent via-primary/20 to-transparent" />
      </div>
    </div>
  )
}
