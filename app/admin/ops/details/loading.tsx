/**
 * Loading skeleton for `/admin/ops/details`.
 *
 * Renders during the server-side `takeOpsSnapshot()` call. Mirrors the
 * five-section telemetry grid so the swap-in is visually stable.
 */

export default function Loading() {
  return (
    <div dir="rtl" lang="ar">
      <div className="mb-8">
        <div className="mb-3 h-4 w-40 animate-pulse rounded bg-muted" />
        <div className="h-7 w-40 animate-pulse rounded bg-muted" />
        <div className="mt-2 h-4 w-96 max-w-full animate-pulse rounded bg-muted/70" />
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="rounded-xl border border-border bg-card p-5 shadow-sm"
          >
            <div className="mb-3 h-5 w-48 animate-pulse rounded bg-muted" />
            <div className="space-y-2">
              <div className="h-3 w-full animate-pulse rounded bg-muted/60" />
              <div className="h-3 w-5/6 animate-pulse rounded bg-muted/60" />
              <div className="h-3 w-4/6 animate-pulse rounded bg-muted/60" />
            </div>
          </div>
        ))}
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm lg:col-span-2">
          <div className="mb-3 h-5 w-56 animate-pulse rounded bg-muted" />
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="h-3 w-full animate-pulse rounded bg-muted/60"
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
