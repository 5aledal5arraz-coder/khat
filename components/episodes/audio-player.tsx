"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { Play, Pause, Volume2, VolumeX } from "lucide-react"
import { cn, formatTimeSeconds } from "@/lib/utils"

interface AudioPlayerProps {
  audioUrl: string
  audioType?: string | null
  title: string
  duration?: number | null
}

export function AudioPlayer({ audioUrl, audioType, title, duration }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const progressRef = useRef<HTMLDivElement>(null)

  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [totalDuration, setTotalDuration] = useState(duration || 0)
  const [muted, setMuted] = useState(false)

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const onTimeUpdate = () => setCurrentTime(audio.currentTime)
    const onLoadedMetadata = () => {
      setTotalDuration(audio.duration)
    }
    const onEnded = () => setIsPlaying(false)

    audio.addEventListener("timeupdate", onTimeUpdate)
    audio.addEventListener("loadedmetadata", onLoadedMetadata)
    audio.addEventListener("ended", onEnded)

    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate)
      audio.removeEventListener("loadedmetadata", onLoadedMetadata)
      audio.removeEventListener("ended", onEnded)
    }
  }, [])

  const togglePlay = useCallback(async () => {
    const audio = audioRef.current
    if (!audio) return

    try {
      if (isPlaying) {
        audio.pause()
        setIsPlaying(false)
      } else {
        await audio.play()
        setIsPlaying(true)
      }
    } catch {
      // iOS Safari may reject play() — ignore
    }
  }, [isPlaying])

  const handleSeek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current
    const bar = progressRef.current
    if (!audio || !bar) return

    const rect = bar.getBoundingClientRect()
    // RTL: clicking on the right side = beginning
    const isRtl = getComputedStyle(bar).direction === "rtl"
    let ratio: number
    if (isRtl) {
      ratio = (rect.right - e.clientX) / rect.width
    } else {
      ratio = (e.clientX - rect.left) / rect.width
    }
    ratio = Math.max(0, Math.min(1, ratio))
    audio.currentTime = ratio * (audio.duration || totalDuration)
  }, [totalDuration])

  const progress = totalDuration > 0 ? (currentTime / totalDuration) * 100 : 0

  return (
    <div className="rounded-2xl border border-border/30 bg-card/80 p-4 sm:p-5">
      <audio ref={audioRef} preload="metadata" muted={muted}>
        <source src={audioUrl} type={audioType || "audio/mpeg"} />
      </audio>

      <div className="flex items-center gap-4">
        {/* Play/Pause */}
        <button
          onClick={togglePlay}
          className={cn(
            "flex h-12 w-12 shrink-0 items-center justify-center rounded-full transition-colors",
            isPlaying
              ? "bg-primary text-primary-foreground"
              : "bg-primary/10 text-primary hover:bg-primary/20",
          )}
          aria-label={isPlaying ? "إيقاف" : "تشغيل"}
        >
          {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 ms-0.5" />}
        </button>

        {/* Progress + info */}
        <div className="min-w-0 flex-1 space-y-2">
          <p className="truncate text-sm font-medium">{title}</p>

          {/* Progress bar */}
          <div
            ref={progressRef}
            className="group relative h-1.5 cursor-pointer rounded-full bg-muted"
            onClick={handleSeek}
          >
            <div
              className="absolute inset-y-0 start-0 rounded-full bg-primary transition-all"
              style={{ width: `${progress}%` }}
            />
            <div
              className="absolute top-1/2 -translate-y-1/2 h-3 w-3 rounded-full bg-primary opacity-0 transition-opacity group-hover:opacity-100"
              style={{ insetInlineStart: `calc(${progress}% - 6px)` }}
            />
          </div>

          {/* Time */}
          <div className="flex justify-between text-[11px] text-muted-foreground tabular-nums" dir="ltr">
            <span>{formatTimeSeconds(currentTime)}</span>
            <span>{formatTimeSeconds(totalDuration)}</span>
          </div>
        </div>

        {/* Mute toggle */}
        <button
          onClick={() => setMuted(!muted)}
          className="hidden sm:flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:text-foreground transition-colors"
          aria-label={muted ? "إلغاء كتم الصوت" : "كتم الصوت"}
        >
          {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        </button>
      </div>
    </div>
  )
}
