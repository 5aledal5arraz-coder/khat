"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Play, Pause, Mic } from "lucide-react"
import { cn, formatTimeSeconds } from "@/lib/utils"

/**
 * A guest's voice note — deliberately NOT `AudioPlayer`.
 *
 * That component is the full episode transport: volume, a scrub rail, an hour
 * of audio. This is thirty seconds of someone saying thank you, sitting inside
 * the guest card. It gets one button, an elapsed count and a progress line.
 *
 * The stored file is always AAC-in-MP4 (see `lib/media/testimonial-audio.ts`),
 * so no `<source type>` negotiation is needed — there is exactly one encoding.
 */
export function VoiceNote({
  src,
  durationSeconds,
  label,
  className,
}: {
  src: string
  durationSeconds?: number | null
  label: string
  className?: string
}) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  // The probed length is a hint for the resting state; the element's own
  // metadata overrides it once loaded, so a null in the DB costs nothing.
  const [total, setTotal] = useState(durationSeconds ?? 0)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const onTime = () => setElapsed(audio.currentTime)
    const onMeta = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) setTotal(audio.duration)
    }
    const onEnd = () => {
      setPlaying(false)
      setElapsed(0)
      audio.currentTime = 0
    }
    // Without this the control sits there looking playable forever when the
    // file is missing — the exact silent failure the media route exists to
    // prevent on the image side.
    const onError = () => {
      setFailed(true)
      setPlaying(false)
    }

    audio.addEventListener("timeupdate", onTime)
    audio.addEventListener("loadedmetadata", onMeta)
    audio.addEventListener("ended", onEnd)
    audio.addEventListener("error", onError)

    return () => {
      audio.removeEventListener("timeupdate", onTime)
      audio.removeEventListener("loadedmetadata", onMeta)
      audio.removeEventListener("ended", onEnd)
      audio.removeEventListener("error", onError)
    }
  }, [])

  const toggle = useCallback(async () => {
    const audio = audioRef.current
    if (!audio) return

    if (playing) {
      audio.pause()
      setPlaying(false)
      return
    }

    try {
      await audio.play()
      setPlaying(true)
    } catch {
      // iOS Safari rejects play() outside a trusted gesture; the next real tap
      // succeeds, so this is not an error state.
      setPlaying(false)
    }
  }, [playing])

  if (failed) return null

  const progress = total > 0 ? Math.min(100, (elapsed / total) * 100) : 0
  const remaining = total > 0 ? Math.max(0, total - elapsed) : null

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-full border border-primary/20 bg-primary/5 px-3 py-2",
        className,
      )}
    >
      {/* `preload="metadata"` so the duration is right before the first tap
          without pulling the audio down for every visitor who never plays it. */}
      <audio ref={audioRef} src={src} preload="metadata" />

      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? `إيقاف: ${label}` : `تشغيل: ${label}`}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-transform hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2"
      >
        {playing ? (
          <Pause className="h-4 w-4" fill="currentColor" />
        ) : (
          // Nudged off-centre: a right-pointing triangle in a circle reads as
          // left-heavy, and this is an RTL page where the eye is stricter about it.
          <Play className="h-4 w-4 -translate-x-px rtl:translate-x-px" fill="currentColor" />
        )}
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-micro text-muted-foreground">
          <Mic className="h-3 w-3 shrink-0 text-primary" />
          <span className="truncate">{label}</span>
        </div>
        <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-primary/15">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-150"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {remaining !== null && (
        <span className="shrink-0 font-mono text-micro tabular-nums text-muted-foreground">
          {formatTimeSeconds(Math.round(playing || elapsed > 0 ? remaining : total))}
        </span>
      )}
    </div>
  )
}
