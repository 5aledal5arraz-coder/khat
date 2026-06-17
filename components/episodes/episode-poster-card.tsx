import Link from "next/link"
import { Play } from "lucide-react"
import { getYouTubeId } from "@/lib/utils"
import type { Episode } from "@/types/database"

/** YouTube/explicit thumbnail for an episode, or null when none resolvable. */
export function episodeThumb(ep: Episode): string | null {
  if (ep.thumbnail_url) return ep.thumbnail_url
  const id = getYouTubeId(ep.youtube_url)
  return id ? `https://img.youtube.com/vi/${id}/maxresdefault.jpg` : null
}

/** Arabic short duration label, e.g. "1 س 12 د" / "18 دقيقة". */
export function episodeDurationLabel(min?: number | null): string | null {
  if (!min || min <= 0) return null
  const h = Math.floor(min / 60)
  const m = min % 60
  return h > 0 ? `${h} س ${m} د` : `${m} دقيقة`
}

export function EpisodeThumb({
  ep,
  className,
  priority,
}: {
  ep: Episode
  className?: string
  priority?: boolean
}) {
  const src = episodeThumb(ep)
  if (!src) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary/15 to-accent/15 text-3xl font-black text-primary/40">
        خط
      </div>
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={ep.title}
      loading={priority ? "eager" : "lazy"}
      className={`h-full w-full object-cover ${className ?? ""}`}
    />
  )
}

/** The light, Apple-editorial episode card — shared across home + episodes list. */
export function EpisodePosterCard({ ep }: { ep: Episode }) {
  return (
    <Link
      href={`/episodes/${ep.slug}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-all hover:-translate-y-1 hover:shadow-[0_2px_8px_rgba(40,30,90,0.05),0_24px_50px_-26px_rgba(40,30,90,0.3)]"
    >
      <div className="relative aspect-video overflow-hidden bg-secondary">
        <EpisodeThumb ep={ep} className="transition-transform duration-500 group-hover:scale-105" />
        <span className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/20">
          <span className="flex h-12 w-12 scale-90 items-center justify-center rounded-full bg-white/90 opacity-0 shadow-lg transition-all duration-300 group-hover:scale-100 group-hover:opacity-100">
            <Play className="h-5 w-5 fill-current text-primary" />
          </span>
        </span>
      </div>
      <div className="flex flex-1 flex-col p-4">
        {ep.guest?.name ? (
          <span className="text-[12px] font-semibold text-accent">{ep.guest.name}</span>
        ) : null}
        <h3 className="mt-1 line-clamp-2 text-[15px] font-bold leading-snug tracking-tight text-foreground">
          {ep.title}
        </h3>
        <div className="mt-auto pt-3 text-[12px] text-muted-foreground">
          {episodeDurationLabel(ep.duration_minutes) ?? "حلقة"}
        </div>
      </div>
    </Link>
  )
}
