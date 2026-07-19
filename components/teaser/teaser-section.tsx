"use client"

import { useState, useRef } from "react"
import Image from "next/image"
import { Play, Sparkles } from "lucide-react"
import type { ActiveTeaserView } from "@/lib/teaser"

/**
 * Homepage teaser card. Site identity (SITE_LIGHT_TOKENS — indigo/orange) via
 * semantic tokens; never imports admin theme.
 *
 * Performance/UX contract (Sara 1,2,6,7,8,13 · Mariam م7,م8):
 *  - aspect-video box is reserved at every size → zero CLS.
 *  - `preload="none"` + no autoplay of any kind → the video never loads until
 *    the user presses play (a real <button>, ≥44px, aria-labelled).
 *  - No poster → a site-identity placeholder (indigo gradient), never a black
 *    rectangle.
 *  - Guest line hides entirely when the linked EIR has no guest yet.
 */
export function TeaserSection({ teaser }: { teaser: ActiveTeaserView }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [activated, setActivated] = useState(false)
  const videoSrc = `/teasers/${teaser.videoFilename}`

  const handlePlay = () => {
    // User-gesture initiated playback — this is NOT autoplay (the element is
    // already in the DOM with preload="none", so nothing loaded until now).
    videoRef.current?.play().catch(() => {})
    setActivated(true)
  }

  return (
    <section className="px-6 pb-8">
      <div className="mx-auto max-w-4xl">
        <h2 className="text-[13px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
          قريبًا على خط
        </h2>

        <div className="mt-5 overflow-hidden rounded-[28px] border border-accent/25 bg-card p-4 shadow-[0_2px_8px_rgba(40,30,90,0.04),0_24px_60px_-30px_rgba(40,30,90,0.28)] sm:p-5">
          <div className="relative aspect-video overflow-hidden rounded-2xl bg-secondary">
            {/* Video is always mounted but hidden until activated; preload="none"
                means no bytes load before the user clicks. */}
            <video
              ref={videoRef}
              src={videoSrc}
              controls={activated}
              playsInline
              preload="none"
              poster={teaser.posterImage ?? undefined}
              className={
                activated
                  ? "h-full w-full bg-black object-contain"
                  : "hidden"
              }
            />

            {!activated && (
              <button
                type="button"
                onClick={handlePlay}
                aria-label="تشغيل التيزر"
                className="group absolute inset-0 flex items-center justify-center"
              >
                {teaser.posterImage ? (
                  <Image
                    src={teaser.posterImage}
                    alt={`تيزر: ${teaser.title}`}
                    fill
                    sizes="(max-width: 768px) 100vw, 768px"
                    className="object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-primary/15 via-secondary to-accent/10">
                    <Sparkles className="h-10 w-10 text-primary/40" />
                  </div>
                )}
                <span className="relative z-10 inline-flex items-center gap-2 rounded-full bg-black/55 px-4 py-2.5 text-[13px] font-semibold text-white backdrop-blur transition-transform group-hover:scale-[1.03]">
                  {/* Play triangle points inline-end (right in LTR); a universal
                      control glyph — do not RTL-flip (Sara 11). */}
                  <Play className="h-4 w-4 fill-current text-accent" />
                  شاهد التيزر
                </span>
              </button>
            )}
          </div>

          <div className="px-2 pb-2 pt-4">
            <h3
              dir="auto"
              className="text-pretty text-xl font-bold leading-snug tracking-tight text-foreground lg:text-2xl"
            >
              {teaser.title}
            </h3>
            {teaser.guestName ? (
              <span className="mt-2 block text-[13px] font-semibold text-accent">
                مع {teaser.guestName}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  )
}
