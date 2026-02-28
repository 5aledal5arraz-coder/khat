"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import Image from "next/image"
import { getYouTubeId, getYouTubeWatchUrl } from "@/lib/utils"
import { updateWatchProgress } from "@/lib/watch-history"
import { trackEvent } from "@/lib/personalization/tracker"
import { usePlayer } from "./episode-player-context"
import { ExternalLink, Play } from "lucide-react"

interface YouTubeEmbedProps {
  url: string
  title: string
  startTime?: number
  episodeId?: string
  episodeSlug?: string
  durationMinutes?: number
}

// Load the YT IFrame API script once globally
let ytApiLoaded = false
let ytApiLoading = false
const ytApiCallbacks: (() => void)[] = []

function loadYTApi(): Promise<void> {
  if (ytApiLoaded && window.YT?.Player) return Promise.resolve()

  return new Promise((resolve) => {
    ytApiCallbacks.push(resolve)

    if (ytApiLoading) return
    ytApiLoading = true

    const prev = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      prev?.()
      ytApiLoaded = true
      ytApiCallbacks.forEach((cb) => cb())
      ytApiCallbacks.length = 0
    }

    const script = document.createElement("script")
    script.src = "https://www.youtube.com/iframe_api"
    document.head.appendChild(script)
  })
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
        className="absolute bottom-3 start-3 rounded-lg bg-black/70 px-3 py-1.5 text-xs text-white/80 hover:text-white transition-colors"
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
  const containerRef = useRef<HTMLDivElement>(null)
  const playerDivRef = useRef<HTMLDivElement>(null)
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const milestonesRef = useRef({ w25: false, w50: false, w90: false })
  const playerInstanceRef = useRef<YT.Player | null>(null)
  const { registerPlayer } = usePlayer()
  const [playerState, setPlayerState] = useState<"thumbnail" | "player" | "blocked">("thumbnail")

  const trackProgress = useCallback(() => {
    if (!episodeId || !episodeSlug || !durationMinutes) return

    const trackingStartTime = Date.now()
    const meta = { duration_minutes: durationMinutes }

    progressIntervalRef.current = setInterval(() => {
      const elapsedMinutes = (Date.now() - trackingStartTime) / 1000 / 60
      const progress = Math.min(100, (elapsedMinutes / durationMinutes) * 100)

      // Watch milestone events — each fires once per session
      if (progress >= 25 && !milestonesRef.current.w25) {
        milestonesRef.current.w25 = true
        trackEvent("watch_25", episodeId, meta)
      }
      if (progress >= 50 && !milestonesRef.current.w50) {
        milestonesRef.current.w50 = true
        trackEvent("watch_50", episodeId, meta)
      }
      if (progress >= 90 && !milestonesRef.current.w90) {
        milestonesRef.current.w90 = true
        trackEvent("watch_90", episodeId, meta)
      }

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

  const createPlayer = useCallback(async () => {
    if (!videoId || !playerDivRef.current) return

    await loadYTApi()

    const player = new YT.Player(playerDivRef.current, {
      videoId,
      playerVars: {
        autoplay: 1,
        rel: 0,
        modestbranding: 1,
        playsinline: 1,
        enablejsapi: 1,
        start: startTime || undefined,
      },
      events: {
        onReady: (event) => {
          playerInstanceRef.current = event.target
          registerPlayer(event.target)
          trackProgress()
        },
        onError: (event) => {
          // 2 = invalid param, 100 = not found, 101/150/153 = embedding disabled
          if ([2, 100, 101, 150, 153].includes(event.data)) {
            setPlayerState("blocked")
          }
        },
      },
    })

    playerInstanceRef.current = player
  }, [videoId, startTime, registerPlayer, trackProgress])

  const handlePlay = useCallback(() => {
    setPlayerState("player")
  }, [])

  // Create the YT player once the div is rendered
  useEffect(() => {
    if (playerState === "player") {
      createPlayer()
    }
  }, [playerState, createPlayer])

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
            onPlay={handlePlay}
          />
        ) : playerState === "blocked" ? (
          <a
            href={watchUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="group relative flex h-full w-full items-center justify-center"
          >
            <Image
              src={`https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`}
              alt={title}
              fill
              sizes="(max-width: 768px) 100vw, 800px"
              className="object-cover brightness-50"
            />
            <div className="relative flex flex-col items-center gap-3 text-center px-6">
              <ExternalLink className="h-8 w-8 text-white/80" />
              <p className="text-sm font-medium text-white">
                التضمين غير متاح لهذا الفيديو
              </p>
              <span className="rounded-full border border-white/30 px-5 py-2 text-sm text-white transition-colors group-hover:bg-white/10">
                شاهد على يوتيوب
              </span>
            </div>
          </a>
        ) : (
          <div
            ref={playerDivRef}
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
