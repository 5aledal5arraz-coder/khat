import { Loader2 } from "lucide-react"

export default function AdminLoading() {
  return (
    <div className="space-y-6">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-7 w-48 animate-pulse rounded-lg bg-muted/50" />
          <div className="h-4 w-32 animate-pulse rounded-md bg-muted/30" />
        </div>
        <div className="h-9 w-28 animate-pulse rounded-xl bg-muted/40" />
      </div>

      {/* KPI cards skeleton */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className="rounded-2xl border border-border/30 bg-card/50 p-5"
          >
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 animate-pulse rounded-xl bg-muted/40" />
              <div className="h-3 w-16 animate-pulse rounded bg-muted/30" />
            </div>
            <div className="mt-4 h-8 w-20 animate-pulse rounded-lg bg-muted/40" />
            <div className="mt-2 h-3 w-28 animate-pulse rounded bg-muted/20" />
          </div>
        ))}
      </div>

      {/* Content skeleton */}
      <div className="grid gap-6 lg:grid-cols-12">
        <div className="space-y-6 lg:col-span-8">
          <div className="rounded-2xl border border-border/30 bg-card/50 p-5">
            <div className="mb-4 flex items-center gap-2">
              <div className="h-4 w-4 animate-pulse rounded bg-muted/40" />
              <div className="h-4 w-32 animate-pulse rounded bg-muted/40" />
            </div>
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="flex items-center gap-4 rounded-xl p-3">
                  <div className="h-8 w-8 animate-pulse rounded-lg bg-muted/30" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-3/4 animate-pulse rounded bg-muted/30" />
                    <div className="h-3 w-1/2 animate-pulse rounded bg-muted/20" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="lg:col-span-4">
          <div className="rounded-2xl border border-border/30 bg-card/50 p-5">
            <div className="mb-4 h-4 w-28 animate-pulse rounded bg-muted/40" />
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="flex items-center gap-3 rounded-xl p-3">
                  <div className="h-10 w-10 animate-pulse rounded-xl bg-muted/30" />
                  <div className="space-y-2">
                    <div className="h-3.5 w-24 animate-pulse rounded bg-muted/30" />
                    <div className="h-3 w-32 animate-pulse rounded bg-muted/20" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Centered loader */}
      <div className="flex items-center justify-center py-4">
        <Loader2 className="h-5 w-5 animate-spin text-primary/40" />
      </div>
    </div>
  )
}
