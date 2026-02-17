"use client"

interface EpisodesHeaderProps {
  totalEpisodes: number
  totalSections: number
  hiddenCount: number
  totalHours: number
}

export function EpisodesHeader({
  totalEpisodes,
  totalSections,
  hiddenCount,
  totalHours,
}: EpisodesHeaderProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <h1 className="text-xl font-bold tracking-tight">الحلقات</h1>
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-border/50 bg-card/80 px-3 py-1.5 text-xs text-muted-foreground">
          {totalEpisodes} حلقة
        </span>
        <span className="rounded-full border border-border/50 bg-card/80 px-3 py-1.5 text-xs text-muted-foreground">
          {totalSections} تصنيف
        </span>
        {hiddenCount > 0 && (
          <span className="rounded-full border border-border/50 bg-card/80 px-3 py-1.5 text-xs text-muted-foreground">
            {hiddenCount} مخفي
          </span>
        )}
        <span className="rounded-full border border-border/50 bg-card/80 px-3 py-1.5 text-xs text-muted-foreground">
          {totalHours} ساعة
        </span>
      </div>
    </div>
  )
}
