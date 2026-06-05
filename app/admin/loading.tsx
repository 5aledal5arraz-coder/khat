export default function AdminLoading() {
  return (
    <div className="space-y-7">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-6 w-44 admin-shimmer" />
          <div className="h-3.5 w-28 admin-shimmer" />
        </div>
        <div className="h-8 w-28 admin-shimmer rounded-lg" />
      </div>

      {/* KPI cards skeleton */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className="admin-card p-5"
          >
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 admin-shimmer rounded-xl" />
              <div className="h-3 w-14 admin-shimmer" />
            </div>
            <div className="mt-4 h-8 w-16 admin-shimmer" />
            <div className="mt-2 h-3 w-24 admin-shimmer" />
          </div>
        ))}
      </div>

      {/* Insights bar skeleton */}
      <div className="admin-card p-5">
        <div className="flex items-center gap-3.5">
          <div className="h-9 w-9 admin-shimmer rounded-xl" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-24 admin-shimmer" />
            <div className="h-3 w-3/4 admin-shimmer" />
          </div>
        </div>
      </div>

      {/* Content skeleton */}
      <div className="grid gap-6 lg:grid-cols-12">
        <div className="space-y-6 lg:col-span-8">
          <div className="admin-card overflow-hidden">
            <div className="flex items-center gap-2.5 border-b border-border/30 px-5 py-3.5">
              <div className="h-4 w-4 admin-shimmer rounded" />
              <div className="h-4 w-28 admin-shimmer" />
            </div>
            <div className="p-3 space-y-1">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="flex items-center gap-3 rounded-lg p-3">
                  <div className="h-8 w-8 admin-shimmer rounded-lg" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3.5 w-3/4 admin-shimmer" />
                    <div className="h-3 w-1/2 admin-shimmer" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="lg:col-span-4">
          <div className="admin-card overflow-hidden">
            <div className="border-b border-border/30 px-5 py-3.5">
              <div className="h-4 w-24 admin-shimmer" />
            </div>
            <div className="p-2.5 space-y-0.5">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="flex items-center gap-3 rounded-lg p-2.5">
                  <div className="h-9 w-9 admin-shimmer rounded-xl" />
                  <div className="space-y-1.5">
                    <div className="h-3.5 w-20 admin-shimmer" />
                    <div className="h-3 w-28 admin-shimmer" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
