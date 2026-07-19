"use client"

import { useState, useRef } from "react"
import Image from "next/image"
import { Play, Sparkles } from "lucide-react"
import type { ActiveTeaserView } from "@/lib/teaser"

/**
 * Compact teaser block for the episode & guest pages (Sara note 5): a
 * horizontal bar (mini poster + "شاهد التيزر" + play) that expands to the
 * inline player on click. The full card is homepage-only.
 *
 * Same performance contract as the homepage card: the <video> is mounted but
 * hidden with preload="none", so nothing loads until the user presses play
 * (no autoplay). playsInline keeps iOS from hijacking to fullscreen.
 */
export function TeaserInline({ teaser }: { teaser: ActiveTeaserView }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [activated, setActivated] = useState(false)
  const videoSrc = `/teasers/${teaser.videoFilename}`

  const handlePlay = () => {
    videoRef.current?.play().catch(() => {})
    setActivated(true)
  }

  return (
    <div>
      {/* Player — always mounted, hidden until activated (preload="none"). */}
      <div className={activated ? "block" : "hidden"}>
        <div className="relative aspect-video overflow-hidden rounded-2xl bg-black">
          <video
            ref={videoRef}
            src={videoSrc}
            controls={activated}
            playsInline
            preload="none"
            poster={teaser.posterImage ?? undefined}
            className="h-full w-full object-contain"
          />
        </div>
      </div>

      {!activated && (
        <button
          type="button"
          onClick={handlePlay}
          aria-label="تشغيل التيزر"
          className="group flex w-full items-center gap-4 rounded-2xl border border-border bg-card p-3 text-start transition-colors hover:border-accent/40"
        >
          <div className="relative aspect-video w-28 shrink-0 overflow-hidden rounded-lg bg-secondary sm:w-36">
            {teaser.posterImage ? (
              <Image
                src={teaser.posterImage}
                alt={`تيزر: ${teaser.title}`}
                fill
                sizes="144px"
                className="object-cover"
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-primary/15 via-secondary to-accent/10">
                <Sparkles className="h-5 w-5 text-primary/40" />
              </div>
            )}
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-black/55 backdrop-blur transition-transform group-hover:scale-105">
                {/* Play triangle points inline-end — universal glyph, not RTL-flipped (Sara 11). */}
                <Play className="h-5 w-5 fill-current text-white" />
              </span>
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <span className="text-[14px] font-bold text-foreground">شاهد التيزر</span>
            <p dir="auto" className="mt-0.5 truncate text-[12.5px] text-muted-foreground">
              {teaser.title}
            </p>
          </div>
        </button>
      )}
    </div>
  )
}
