"use client"

import { useState } from "react"
import { MUSEUM_QUOTES } from "@/lib/content/museum-data"
import { Quote } from "lucide-react"

export function MuseumPhilosophyFeed() {
  return (
    <section className="relative bg-[#0F0E0D] px-6 py-20 sm:py-32 md:py-40">
      <div className="relative z-10 mx-auto max-w-7xl">
        {/* Header — identical structure to gallery header */}
        <header className="mx-auto mb-16 max-w-3xl space-y-6 text-center sm:mb-24 md:mb-32 md:space-y-8">
          <span className="text-[10px] font-bold tracking-[0.3em] text-primary">
            عبارات تحتها خط
          </span>
          <h2 className="museum-font-headline text-3xl tracking-tight sm:text-4xl md:text-5xl lg:text-7xl">
            ما تبقى بعد أن سكت الصوت
          </h2>
          <div className="mx-auto h-px w-16 bg-primary/40 sm:w-24" />
        </header>

        {/* Quotes grid — same grid as gallery */}
        <div className="grid grid-cols-1 gap-12 sm:gap-16 md:grid-cols-2 md:gap-24 lg:grid-cols-3">
          {MUSEUM_QUOTES.map((quote, index) => (
            <QuoteCard key={index} quote={quote} index={index} />
          ))}
        </div>
      </div>
    </section>
  )
}

function QuoteCard({ quote, index }: { quote: string; index: number }) {
  const [hovered, setHovered] = useState(false)

  return (
    <div
      className="group flex h-full flex-col"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Card frame — same as episode card */}
      <div className="museum-frame mb-6 flex flex-1 flex-col overflow-hidden sm:mb-8">
        <div className="relative aspect-[3/4] overflow-hidden bg-black/40">
          {/* Background — dark gradient instead of image */}
          <div className="absolute inset-0 bg-gradient-to-b from-black via-[#0A0908] to-black" />

          {/* Quote content — always visible, centered */}
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center sm:p-8 md:p-10">
            <Quote
              className={`mb-4 h-8 w-8 transition-colors duration-700 sm:mb-6 sm:h-10 sm:w-10 ${
                hovered ? "text-primary/60" : "text-primary/20"
              }`}
            />
            <p
              className={`museum-font-headline text-base italic leading-relaxed transition-colors duration-700 sm:text-lg md:text-xl ${
                hovered ? "text-foreground" : "text-foreground/70"
              }`}
            >
              &ldquo;{quote}&rdquo;
            </p>
          </div>

          {/* Gold light effect on hover */}
          <div
            className={`absolute inset-0 bg-gradient-to-tr from-transparent via-primary/5 to-transparent transition-opacity duration-700 ${
              hovered ? "opacity-100" : "opacity-0"
            }`}
          />
        </div>
      </div>

      {/* Label area — same structure as episode card */}
      <div className="space-y-3 px-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold tracking-widest text-primary/60">
            رؤية جوهرية
          </span>
          <span className="text-[10px] tracking-widest text-muted-foreground">
            {String(index + 1).padStart(2, "0")}
          </span>
        </div>
        <div className="pt-4">
          <div className="flex items-center gap-4 text-[10px] font-bold tracking-[0.2em] text-muted-foreground transition-colors group-hover:text-primary">
            <span className="h-px w-8 bg-muted-foreground transition-colors group-hover:bg-primary" />
            عبارة تحتها خط
          </div>
        </div>
      </div>
    </div>
  )
}
