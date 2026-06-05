"use client"

import { useEffect, useState } from "react"
import { MoveDown } from "lucide-react"

export function MuseumHero() {
  const [mounted, setMounted] = useState(false)

  // Hydration-safe mounted flag — prevents SSR/client mismatch for animations
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setMounted(true)
  }, [])
  /* eslint-enable react-hooks/set-state-in-effect */

  const scrollToGallery = () => {
    document.getElementById("gallery")?.scrollIntoView({ behavior: "smooth" })
  }

  return (
    <section className="relative flex h-screen flex-col items-center justify-center overflow-hidden bg-museum-bg">
      {/* Dynamic Background Ambience */}
      <div className="pointer-events-none absolute inset-0 z-0">
        <div className="absolute left-1/2 top-0 h-[120%] w-[120%] -translate-x-1/2 bg-[radial-gradient(circle_at_50%_50%,rgba(240,201,84,0.05)_0%,transparent_60%)] museum-glow-pulse" />
      </div>

      {/* Entrance Content */}
      <div
        className={`z-10 max-w-4xl space-y-12 px-6 text-center transition-all duration-1000 ${
          mounted ? "opacity-100" : "opacity-0"
        }`}
      >
        <div className="space-y-6">
          <p className="museum-gold-glow text-xs font-bold tracking-[0.3em] text-primary animate-pulse">
            بودكاست خط
          </p>
          <h1 className="museum-font-headline text-8xl font-light leading-none tracking-tighter md:text-[10rem]">
            متحف <span className="italic text-primary">خط</span>
          </h1>
          <div className="mx-auto h-px w-16 bg-primary/40" />
          <p className="text-2xl font-light italic tracking-wide text-muted-foreground md:text-3xl">
            &ldquo;كالعبارات التي تضع تحتها خط&rdquo;
          </p>
        </div>

        <div className="flex flex-col items-center gap-12 pt-16">
          <button
            onClick={scrollToGallery}
            className="border border-primary/30 px-12 py-5 text-sm tracking-[0.2em] text-primary transition-all duration-500 hover:scale-105 hover:bg-primary hover:text-background active:scale-95"
          >
            ادخل المعرض
          </button>

          <div className="flex flex-col items-center gap-4 opacity-30">
            <span className="text-[10px] tracking-[0.2em]">ابدأ الرحلة</span>
            <MoveDown className="h-4 w-4" />
          </div>
        </div>
      </div>

      {/* Decorative Architecture */}
      <div className="absolute left-0 top-0 h-32 w-full bg-gradient-to-b from-black to-transparent" />
      <div className="absolute bottom-0 left-0 h-32 w-full bg-gradient-to-t from-black to-transparent" />
      <div className="absolute start-10 top-1/2 hidden h-64 w-px -translate-y-1/2 bg-gradient-to-b from-transparent via-primary/20 to-transparent lg:block" />
      <div className="absolute end-10 top-1/2 hidden h-64 w-px -translate-y-1/2 bg-gradient-to-b from-transparent via-primary/20 to-transparent lg:block" />
    </section>
  )
}
