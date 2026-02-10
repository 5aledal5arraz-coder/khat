"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import Image from "next/image"
import { getYouTubeId, getYouTubeEmbedUrl, getYouTubeWatchUrl } from "@/lib/utils"
import { updateWatchProgress } from "@/lib/watch-history"
import { ExternalLink, Play } from "lucide-react"

interface YouTubeEmbedProps {
  url: string
  title: string
  startTime?: number
  episodeId?: string
  episodeSlug?: string
  durationMinutes?: number
}

function ThumbnailOverlay({
  videoId,
  watchUrl,
  title,
  onPlay,
}: {
  videoId: string
  watchUrl: string
  title: string
  onPlay?: () => void
}) {
  return (
    <div className="group relative h-full w-full cursor-pointer" onClick={onPlay}>
      <Image
        src={`https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`}
        alt={title}
        fill
        sizes="(max-width: 768px) 100vw, 800px"
        className="object-cover"
      />
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/40 transition-colors group-hover:bg-black/50">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-600 shadow-lg transition-transform group-hover:scale-110">
          <Play className="h-7 w-7 ms-1 text-white" fill="currentColor" />
        </div>
      </div>
      <a
        href={watchUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="absolute bottom-3 left-3 rounded-lg bg-black/70 px-3 py-1.5 text-xs text-white/80 hover:text-white transition-colors"
      >
        شاهد على يوتيوب
      </a>
    </div>
  )
}

export function YouTubeEmbed({
  url,
  title,
  startTime,
  episodeId,
  episodeSlug,
  durationMinutes,
}: YouTubeEmbedProps) {
  const videoId = getYouTubeId(url)
  const watchUrl = getYouTubeWatchUrl(url, startTime)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null)
  // Start with thumbnail; load iframe on click (avoids broken embed for restricted videos)
  const [playerState, setPlayerState] = useState<"thumbnail" | "iframe">("thumbnail")

  const embedUrl = getYouTubeEmbedUrl(url, startTime)

  const trackProgress = useCallback(() => {
    if (!episodeId || !episodeSlug || !durationMinutes) return

    const trackingStartTime = Date.now()

    progressIntervalRef.current = setInterval(() => {
      const elapsedMinutes = (Date.now() - trackingStartTime) / 1000 / 60
      const progress = Math.min(100, (elapsedMinutes / durationMinutes) * 100)

      if (progress >= 5) {
        updateWatchProgress(
          {
            id: episodeId,
            title,
            slug: episodeSlug,
            youtube_url: url,
            duration_minutes: durationMinutes,
          },
          progress
        )
      }
    }, 30000)
  }, [episodeId, episodeSlug, durationMinutes, title, url])

  useEffect(() => {
    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current)
      }
    }
  }, [])

  const handleIframeLoad = useCallback(() => {
    trackProgress()
    requestAnimationFrame(() => {
      containerRef.current?.getBoundingClientRect()
      window.dispatchEvent(new Event("resize"))
    })
  }, [trackProgress])

  if (!url || !videoId) {
    return (
      <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-muted flex items-center justify-center">
        <p className="text-muted-foreground">الفيديو غير متوفر</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div
        id="episode-player"
        ref={containerRef}
        className="relative w-full overflow-hidden rounded-xl bg-black"
        style={{
          aspectRatio: "16 / 9",
          contain: "layout paint",
          transform: "translateZ(0)",
        }}
      >
        {playerState === "thumbnail" ? (
          <ThumbnailOverlay
            videoId={videoId}
            watchUrl={watchUrl}
            title={title}
            onPlay={() => setPlayerState("iframe")}
          />
        ) : (
          <iframe
            ref={iframeRef}
            src={`${embedUrl}&autoplay=1`}
            title={title}
            frameBorder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            onLoad={handleIframeLoad}
            className="absolute inset-0 h-full w-full"
          />
        )}
      </div>
      <a
        href={watchUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ExternalLink className="h-4 w-4" />
        شاهد على يوتيوب
      </a>
    </div>
  )
}
