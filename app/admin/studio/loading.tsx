export default function StudioLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-7 w-32 admin-shimmer rounded-lg bg-muted/50" />
      </div>
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="rounded-xl border border-border/30 bg-card/50 p-5">
            <div className="h-3 w-16 admin-shimmer rounded bg-muted/30" />
            <div className="mt-3 h-8 w-12 admin-shimmer rounded-lg bg-muted/40" />
            <div className="mt-2 h-3 w-20 admin-shimmer rounded bg-muted/20" />
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-border/30 bg-card/50 overflow-hidden">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3.5 border-b border-border/20 last:border-b-0">
            <div className="h-10 w-16 admin-shimmer rounded-lg bg-muted/30 shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-48 admin-shimmer rounded bg-muted/30" />
              <div className="h-3 w-32 admin-shimmer rounded bg-muted/20" />
            </div>
            <div className="h-6 w-14 admin-shimmer rounded-md bg-muted/20" />
          </div>
        ))}
      </div>
    </div>
  )
}
