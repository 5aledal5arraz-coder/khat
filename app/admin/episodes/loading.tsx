export default function EpisodesLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-7 w-32 animate-pulse rounded-lg bg-muted/50" />
          <div className="h-5 w-16 animate-pulse rounded-full bg-muted/30" />
        </div>
        <div className="h-9 w-24 animate-pulse rounded-xl bg-muted/40" />
      </div>
      <div className="flex gap-2">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-8 w-20 animate-pulse rounded-lg bg-muted/30" />
        ))}
      </div>
      <div className="space-y-2">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="flex items-center gap-4 rounded-xl border border-border/20 bg-card/50 p-4">
            <div className="h-12 w-20 animate-pulse rounded-lg bg-muted/30" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-3/4 animate-pulse rounded bg-muted/30" />
              <div className="h-3 w-1/3 animate-pulse rounded bg-muted/20" />
            </div>
            <div className="h-5 w-16 animate-pulse rounded-full bg-muted/20" />
          </div>
        ))}
      </div>
    </div>
  )
}
