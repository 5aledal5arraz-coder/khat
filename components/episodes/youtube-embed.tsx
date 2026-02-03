"use client"

import { getYouTubeEmbedUrl } from "@/lib/utils"

interface YouTubeEmbedProps {
  url: string
  title: string
}

export function YouTubeEmbed({ url, title }: YouTubeEmbedProps) {
  const embedUrl = getYouTubeEmbedUrl(url)

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-muted">
      <iframe
        src={embedUrl}
        title={title}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
        className="absolute inset-0 h-full w-full"
      />
    </div>
  )
}
