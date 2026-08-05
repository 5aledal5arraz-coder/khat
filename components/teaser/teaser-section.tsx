"use client"

import { useState, useRef } from "react"
import Image from "next/image"
import { Sparkles } from "lucide-react"
import { PlayBadge } from "@/components/media/play-badge"
import type { ActiveTeaserView } from "@/lib/teaser"
import { TeaserQuestionForm } from "./teaser-question-form"

/**
 * Homepage teaser card. Brand identity (indigo/orange) via the semantic
 * tokens defined in the :root block of app/globals.css; never imports admin
 * theme.
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
        <h2 className="text-caption font-bold uppercase text-muted-foreground">
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
                {/* The shared badge, not a labelled pill. The pill was a
                    120px-wide block of white type sitting on an image we did
                    not compose — and the card's own title, one row below,
                    already names the thing. */}
                <PlayBadge className="relative z-10 group-hover:scale-105" />
              </button>
            )}
          </div>

          <div className="px-2 pb-2 pt-4">
            <h3
              dir="auto"
              className="text-pretty text-lead font-bold text-foreground lg:text-subhead"
            >
              {teaser.title}
            </h3>
            {teaser.guestName ? (
              <span className="mt-2 block text-caption font-semibold text-accent-strong">
                مع {teaser.guestName}
              </span>
            ) : null}

            {/* «اسأل الضيف» — live teasers only. */}
            {teaser.acceptsQuestions ? (
              <TeaserQuestionForm teaserId={teaser.id} prompt={teaser.prompt} />
            ) : null}
          </div>
        </div>
      </div>
    </section>
  )
}
