export default function EpisodesLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-7 w-32 admin-shimmer rounded-lg bg-muted/50" />
          <div className="h-5 w-16 admin-shimmer rounded-md bg-muted/30" />
        </div>
        <div className="h-9 w-24 admin-shimmer rounded-lg bg-muted/40" />
      </div>
      <div className="flex gap-2">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-8 w-20 admin-shimmer rounded-lg bg-muted/30" />
        ))}
      </div>
      <div className="space-y-1 overflow-hidden rounded-xl border border-border/30 bg-card/50">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-3 py-3">
            <div className="h-9 w-16 admin-shimmer rounded-md bg-muted/30" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-3/4 admin-shimmer rounded bg-muted/30" />
              <div className="h-3 w-1/3 admin-shimmer rounded bg-muted/20" />
            </div>
            <div className="hidden h-4 w-16 admin-shimmer rounded bg-muted/20 md:block" />
          </div>
        ))}
      </div>
    </div>
  )
}
