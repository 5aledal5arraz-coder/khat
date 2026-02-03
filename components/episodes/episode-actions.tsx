"use client"

import { SaveButton } from "@/components/actions/save-button"
import { ShareButton } from "@/components/actions/share-button"

interface EpisodeActionsProps {
  episode: {
    id?: string
    slug: string
    title: string
    guest?: { name: string } | null
  }
  variant?: "ghost" | "outline" | "default"
  size?: "default" | "sm" | "lg" | "icon"
  showLabels?: boolean
  className?: string
}

export function EpisodeActions({
  episode,
  variant = "ghost",
  size = "icon",
  showLabels = false,
  className,
}: EpisodeActionsProps) {
  const episodeUrl = typeof window !== "undefined"
    ? `${window.location.origin}/episodes/${episode.slug}`
    : `/episodes/${episode.slug}`

  return (
    <div className={className}>
      <SaveButton
        item={{
          id: episode.id || episode.slug,
          type: "episode",
          title: episode.title,
          subtitle: episode.guest?.name ? `مع ${episode.guest.name}` : undefined,
          slug: episode.slug,
        }}
        variant={variant}
        size={size}
        showLabel={showLabels}
      />
      <ShareButton
        title={episode.title}
        text={episode.guest?.name ? `${episode.title} - مع ${episode.guest.name}` : episode.title}
        url={episodeUrl}
        variant={variant}
        size={size}
        showLabel={showLabels}
      />
    </div>
  )
}
