"use client"

interface EpisodesHeaderProps {
  totalEpisodes: number
  hiddenCount: number
  totalHours: number
}

export function EpisodesHeader({
  totalEpisodes,
  hiddenCount,
  totalHours,
}: EpisodesHeaderProps) {
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <h1 className="text-xl font-bold tracking-tight">الحلقات</h1>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="rounded-md bg-muted/60 px-2 py-0.5 text-[11px] font-medium text-muted-foreground/70">
          {totalEpisodes} حلقة
        </span>
        {hiddenCount > 0 && (
          <span className="rounded-md bg-muted/60 px-2 py-0.5 text-[11px] font-medium text-muted-foreground/70">
            {hiddenCount} مخفي
          </span>
        )}
        <span className="rounded-md bg-muted/60 px-2 py-0.5 text-[11px] font-medium text-muted-foreground/70">
          {totalHours} ساعة
        </span>
      </div>
    </div>
  )
}
