export default function MembersLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="h-7 w-28 animate-pulse rounded-lg bg-muted/50" />
        <div className="h-9 w-28 animate-pulse rounded-xl bg-muted/40" />
      </div>
      <div className="flex gap-3">
        <div className="h-10 flex-1 animate-pulse rounded-xl bg-muted/30" />
        <div className="h-10 w-24 animate-pulse rounded-xl bg-muted/30" />
      </div>
      <div className="rounded-2xl border border-border/20 bg-card/50">
        <div className="space-y-0 divide-y divide-border/20">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-4">
              <div className="h-9 w-9 animate-pulse rounded-full bg-muted/30" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-40 animate-pulse rounded bg-muted/30" />
                <div className="h-3 w-48 animate-pulse rounded bg-muted/20" />
              </div>
              <div className="h-6 w-14 animate-pulse rounded-md bg-muted/20" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
