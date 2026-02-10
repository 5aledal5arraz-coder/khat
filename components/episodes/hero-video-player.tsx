"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Clock, Play, Pause, Volume2, VolumeX } from "lucide-react"
import { formatDuration, formatDate, getYouTubeId } from "@/lib/utils"

interface HeroVideoPlayerProps {
  episode: {
    title: string
    slug: string
    youtube_url: string
    release_date: string
    duration_minutes: number
    summary?: string | null
    guest?: { name: string } | null
  }
}

export function HeroVideoPlayer({ episode }: HeroVideoPlayerProps) {
  const [isMuted, setIsMuted] = useState(true)
  const [isPlaying, setIsPlaying] = useState(true) // Starts playing due to autoplay
  const [isLoaded, setIsLoaded] = useState(false)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const videoId = getYouTubeId(episode.youtube_url)

  // Build embed URL with autoplay, muted (required for autoplay), and loop
  const embedUrl = `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&loop=1&playlist=${videoId}&controls=0&modestbranding=1&rel=0&playsinline=1&enablejsapi=1`

  useEffect(() => {
    // Mark as loaded after a short delay to show the video
    const timer = setTimeout(() => setIsLoaded(true), 500)
    return () => clearTimeout(timer)
  }, [])

  const toggleMute = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    if (iframeRef.current?.contentWindow) {
      const message = isMuted ? '{"event":"command","func":"unMute","args":""}' : '{"event":"command","func":"mute","args":""}'
      iframeRef.current.contentWindow.postMessage(message, "https://www.youtube.com")
      setIsMuted(!isMuted)
    }
  }

  const togglePlayPause = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    if (iframeRef.current?.contentWindow) {
      const message = isPlaying
        ? '{"event":"command","func":"pauseVideo","args":""}'
        : '{"event":"command","func":"playVideo","args":""}'
      iframeRef.current.contentWindow.postMessage(message, "https://www.youtube.com")
      setIsPlaying(!isPlaying)
    }
  }

  return (
    <Card className="group overflow-hidden border-primary/20 transition-all hover:border-primary/50 hover:shadow-xl">
      <div
        className="relative aspect-video overflow-hidden bg-muted"
        style={{ contain: "layout paint", transform: "translateZ(0)" }}
      >
        {/* YouTube Embed with Autoplay */}
        <iframe
          ref={iframeRef}
          src={embedUrl}
          title={episode.title}
          frameBorder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className={`absolute inset-0 h-full w-full border-0 transition-opacity duration-500 ${isLoaded ? "opacity-100" : "opacity-0"}`}
        />

        {/* Loading placeholder */}
        {!isLoaded && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        )}

        {/* Gradient overlay for text readability */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30" />

        {/* Badge */}
        <Badge className="absolute start-4 top-4 bg-primary text-primary-foreground">
          أحدث حلقة
        </Badge>

        {/* Mute toggle button */}
        <Button
          size="icon"
          variant="secondary"
          className="absolute top-4 end-4 h-10 w-10 rounded-full bg-black/50 hover:bg-black/70"
          onClick={toggleMute}
        >
          {isMuted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
        </Button>

        {/* Episode info overlay */}
        <Link href={`/episodes/${episode.slug}`} className="absolute bottom-0 start-0 end-0 p-4">
          <h2 className="text-xl font-bold text-white md:text-2xl">
            {episode.title}
          </h2>
          {episode.guest && (
            <p className="mt-1 text-sm text-white/80">مع {episode.guest.name}</p>
          )}
          <div className="mt-3 flex items-center gap-4 text-sm text-white/70">
            <span className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              {formatDuration(episode.duration_minutes)}
            </span>
            <span>{formatDate(episode.release_date)}</span>
          </div>
        </Link>

        {/* Play/Pause button */}
        <Button
          size="icon"
          variant="secondary"
          className="absolute bottom-4 end-4 h-10 w-10 rounded-full"
          onClick={togglePlayPause}
        >
          {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
        </Button>
      </div>
    </Card>
  )
}
