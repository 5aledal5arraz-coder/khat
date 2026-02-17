"use client"

import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Play } from "lucide-react"

interface AboutVideoProps {
  videoId?: string
  welcomeVideoUrl?: string
  welcomeVideoPosterUrl?: string
}

export function AboutVideo({ videoId, welcomeVideoUrl, welcomeVideoPosterUrl }: AboutVideoProps) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [videoError, setVideoError] = useState(false)

  // If self-hosted video fails to play, fall back to YouTube embed if available
  const useSelfHosted = welcomeVideoUrl && !videoError

  if (!welcomeVideoUrl && !videoId) return null

  return (
    <section className="py-16 bg-secondary/30">
      <div className="container mx-auto px-4">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-10">
            <Badge variant="outline" className="mb-4">
              <Play className="w-3 h-3 me-1.5" />
              رسالة ترحيبية
            </Badge>
            <h2 className="text-3xl font-bold mb-4">تعرف على خط</h2>
            <p className="text-muted-foreground">
              شاهد هذا الفيديو القصير لتتعرف على البودكاست ورؤيتنا
            </p>
          </div>

          <div className="relative aspect-video rounded-2xl overflow-hidden shadow-2xl border border-border/50 group">
            {useSelfHosted ? (
              <video
                src={welcomeVideoUrl}
                controls
                playsInline
                poster={welcomeVideoPosterUrl || undefined}
                className="absolute inset-0 w-full h-full object-contain bg-black"
                onError={() => setVideoError(true)}
              />
            ) : !isPlaying ? (
              <>
                <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-background to-accent/20" />
                {videoId ? (
                  <button
                    onClick={() => setIsPlaying(true)}
                    aria-label="تشغيل الفيديو الترحيبي"
                    className="absolute inset-0 flex items-center justify-center group/btn"
                  >
                    <div className="relative">
                      <div className="absolute inset-0 bg-primary rounded-full blur-xl opacity-50 group-hover/btn:opacity-75 transition-opacity animate-pulse" />
                      <div className="relative flex items-center justify-center w-20 h-20 lg:w-24 lg:h-24 rounded-full bg-primary text-primary-foreground shadow-xl group-hover/btn:scale-110 transition-transform duration-300">
                        <Play className="w-8 h-8 lg:w-10 lg:h-10 ms-1" fill="currentColor" />
                      </div>
                    </div>
                  </button>
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm">
                    تعذر تشغيل الفيديو في هذا المتصفح
                  </div>
                )}
                <div className="absolute bottom-4 start-4 end-4 flex items-center justify-between text-white/80 text-sm">
                  <span>فيديو ترحيبي</span>
                </div>
              </>
            ) : (
              <iframe
                src={`https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0`}
                title="فيديو ترحيبي"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="absolute inset-0 w-full h-full"
              />
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
