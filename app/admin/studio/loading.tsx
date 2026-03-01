export default function StudioLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-7 w-32 animate-pulse rounded-lg bg-muted/50" />
        <div className="h-5 w-16 animate-pulse rounded-full bg-muted/30" />
        <div className="h-5 w-16 animate-pulse rounded-full bg-muted/30" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="rounded-2xl border border-border/20 bg-card/50 p-5 space-y-3">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 animate-pulse rounded-lg bg-muted/30" />
              <div className="h-4 w-24 animate-pulse rounded bg-muted/30" />
            </div>
            <div className="h-4 w-full animate-pulse rounded bg-muted/20" />
            <div className="h-3 w-2/3 animate-pulse rounded bg-muted/15" />
            <div className="flex gap-2 pt-2">
              <div className="h-7 w-16 animate-pulse rounded-lg bg-muted/20" />
              <div className="h-7 w-16 animate-pulse rounded-lg bg-muted/20" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
