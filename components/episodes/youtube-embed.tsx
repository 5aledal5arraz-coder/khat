"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { getYouTubeId, getYouTubeWatchUrl } from "@/lib/utils"
import { updateWatchProgress } from "@/lib/watch-history"
import { usePlayer } from "./episode-player-context"
import { EpisodeThumb } from "@/components/media/episode-thumb"
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

  return new Promise<void>((resolve, reject) => {
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
    script.onerror = () => {
      // Network blocked the API (offline, firewall, or a privacy extension
      // that blocks youtube.com). Reset the flag so a later attempt can
      // re-inject, and surface the failure so the caller can fall back.
      ytApiLoading = false
      reject(new Error("Failed to load YouTube IFrame API"))
    }
    document.head.appendChild(script)
  })
}

function ThumbnailOverlay({
  url,
  title,
  onPlay,
}: {
  url: string
  title: string
  onPlay?: () => void
}) {
  return (
    <div className="group relative h-full w-full">
      {/* A real <button>, not a click-handling div: the thumbnail is the only
          way to start the video, and as a div it was unreachable by keyboard
          (WCAG 2.1.1 — the whole player exposed exactly one tab stop, the
          "watch on YouTube" link). Transparent and full-bleed, so the visual
          design is byte-for-byte what it was. The focus ring is drawn inset
          because the player wrapper clips overflow, which would swallow the
          global ring-offset-2. */}
      <button
        type="button"
        onClick={onPlay}
        aria-label={`تشغيل الفيديو: ${title}`}
        className="absolute inset-0 z-10 h-full w-full cursor-pointer focus-visible:ring-inset focus-visible:ring-offset-0"
      />
      <EpisodeThumb
        ep={{ title, thumbnail_url: null, youtube_url: url }}
        sizes="(max-width: 768px) 100vw, 800px"
      />
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/40 transition-colors group-hover:bg-black/50">
        {/* `bg-red-600` stays a literal on purpose — it is YouTube's play
            button, not ours. This is functional colour: it tells the visitor
            "this plays on YouTube" before anything loads. Tokenising it would
            wire a third party's brand to KHAT's palette, so the next identity
            change would silently repaint YouTube's mark. Do not convert. */}
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-600 shadow-lg transition-transform group-hover:scale-110">
          <Play className="h-7 w-7 ms-1 text-white" fill="currentColor" />
        </div>
      </div>
      {/* ص-٨ — the overlaid "شاهد على يوتيوب" chip was removed.
          An identical link already renders immediately below the frame and,
          unlike this one, it survives all three player states. On load both
          were visible a few pixels apart, and this copy sat INSIDE the
          thumbnail at z-20 — above the transparent play button — so a
          visitor aiming at the video could leave the site instead of
          starting it. The link below the frame is the one that stays. */}
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
      }
      if (progress >= 50 && !milestonesRef.current.w50) {
        milestonesRef.current.w50 = true
      }
      if (progress >= 90 && !milestonesRef.current.w90) {
        milestonesRef.current.w90 = true
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

    // Fail fast if the API can't load (blocked / offline / privacy extension)
    // or hangs. Throwing lets the effect fall back to the watch link instead
    // of leaving the player a dead black box.
    await Promise.race([
      loadYTApi(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("YouTube IFrame API load timed out")), 8000)
      ),
    ])

    if (!window.YT?.Player) {
      throw new Error("YouTube IFrame API unavailable")
    }

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
      // The fallback setState lives in the rejection callback (deferred), not
      // synchronously in the effect body — shows the watch link if the API
      // can't load (blocked / offline / privacy extension).
      createPlayer().catch(() => setPlayerState("blocked"))
    }
  }, [playerState, createPlayer])

  if (!url || !videoId) {
    return (
      <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-muted flex items-center justify-center">
        <p className="text-muted-foreground">الفيديو غير متوفر</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div
        id="episode-player"
        ref={containerRef}
        className="relative w-full overflow-hidden rounded-2xl bg-black"
        style={{
          aspectRatio: "16 / 9",
          contain: "layout paint",
          transform: "translateZ(0)",
        }}
      >
        {playerState === "thumbnail" ? (
          <ThumbnailOverlay
            url={url}
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
            {/* `brightness-50` here is NOT the saturation policy the cards had
                — this state is a dead player with a white message printed over
                it, and that message has to be readable. */}
            <EpisodeThumb
              ep={{ title, thumbnail_url: null, youtube_url: url }}
              sizes="(max-width: 768px) 100vw, 800px"
              className="brightness-50"
            />
            <div className="relative flex flex-col items-center gap-3 text-center px-6">
              <ExternalLink className="h-8 w-8 text-background/80" />
              <p className="text-caption font-medium text-background">
                التضمين غير متاح لهذا الفيديو
              </p>
              <span className="rounded-full border border-background/30 px-5 py-2 text-caption text-background transition-colors group-hover:bg-background/10">
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
        className="inline-flex items-center gap-1 text-caption text-muted-foreground hover:text-foreground transition-colors"
      >
        <ExternalLink className="h-4 w-4" />
        شاهد على يوتيوب
      </a>
    </div>
  )
}
