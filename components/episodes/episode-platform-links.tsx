import Link from "next/link"
import { ExternalLink } from "lucide-react"
import { PlatformIcon } from "@/components/platforms/platform-icon"
import type { PodcastPlatformLink } from "@/types/database"

interface EpisodePlatformLinksProps {
  platforms: PodcastPlatformLink[]
  maxVisible?: number
}

export function EpisodePlatformLinks({
  platforms,
  maxVisible = 3,
}: EpisodePlatformLinksProps) {
  if (platforms.length === 0) return null

  const visible = platforms.slice(0, maxVisible)
  const hasMore = platforms.length > maxVisible

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-muted-foreground">استمع على</span>
      {visible.map((p) => (
        <a
          key={p.id}
          href={p.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-full border border-border/30 bg-card/60 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/30 hover:text-primary"
        >
          <PlatformIcon iconName={p.icon_name} className="h-3.5 w-3.5" />
          {p.platform_name}
          <ExternalLink className="h-2.5 w-2.5 opacity-50" />
        </a>
      ))}
      {hasMore && (
        <Link
          href="/listen"
          className="inline-flex items-center gap-1 rounded-full border border-border/30 bg-card/60 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/30 hover:text-primary"
        >
          المزيد
        </Link>
      )}
    </div>
  )
}
