export default function HomeLoading() {
  return (
    <div>
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-2xl">
        {/* Hero skeleton */}
        <div className="flex min-h-[60vh] flex-col items-center justify-center py-16">
          <div className="mx-auto max-w-2xl space-y-6 text-center">
            <div className="mx-auto h-4 w-24 animate-pulse rounded bg-muted" />
            <div className="space-y-3">
              <div className="mx-auto h-8 w-3/4 animate-pulse rounded bg-muted" />
              <div className="mx-auto h-8 w-1/2 animate-pulse rounded bg-muted" />
            </div>
            <div className="mx-auto h-4 w-32 animate-pulse rounded bg-muted" />
          </div>
        </div>
        {/* Paths skeleton */}
        <div className="py-12">
          <div className="mb-8 space-y-2 text-center">
            <div className="mx-auto h-7 w-48 animate-pulse rounded bg-muted" />
            <div className="mx-auto h-4 w-40 animate-pulse rounded bg-muted" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex flex-col items-center gap-3 rounded-xl border p-6">
                <div className="h-14 w-14 animate-pulse rounded-full bg-muted" />
                <div className="h-4 w-20 animate-pulse rounded bg-muted" />
                <div className="h-3 w-24 animate-pulse rounded bg-muted" />
              </div>
            ))}
          </div>
        </div>
        {/* Episodes skeleton */}
        <div className="py-12 space-y-4">
          <div className="h-6 w-40 animate-pulse rounded bg-muted" />
          <div className="aspect-video animate-pulse rounded-xl bg-muted" />
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex gap-4 rounded-xl border p-4">
              <div className="h-20 w-32 shrink-0 animate-pulse rounded-lg bg-muted" />
              <div className="flex flex-1 flex-col justify-between">
                <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
                <div className="h-3 w-24 animate-pulse rounded bg-muted" />
              </div>
            </div>
          ))}
        </div>
        </div>
      </div>
    </div>
  )
}
