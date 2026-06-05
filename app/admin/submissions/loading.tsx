export default function SubmissionsLoading() {
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
      <div className="flex gap-2">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-9 w-28 admin-shimmer rounded-lg bg-muted/30" />
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="rounded-xl border border-border/30 bg-card/50 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="h-5 w-32 admin-shimmer rounded bg-muted/30" />
              <div className="h-5 w-14 admin-shimmer rounded-md bg-muted/20" />
            </div>
            <div className="h-3 w-48 admin-shimmer rounded bg-muted/20" />
            <div className="h-3 w-36 admin-shimmer rounded bg-muted/15" />
          </div>
        ))}
      </div>
    </div>
  )
}
