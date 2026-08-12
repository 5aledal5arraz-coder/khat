import { Skeleton } from "@/components/ui/skeleton"

/**
 * Inside `(list)` — a route group — so this skeleton covers `/guests` and
 * nothing else. At `app/guests/loading.tsx` its Suspense boundary also wrapped
 * `[slug]`, which flushed a 200 before the guest page could call `notFound()`;
 * see the note in app/(home)/loading.tsx for the full mechanism. The URL is
 * unchanged — route groups are not path segments.
 */
export default function GuestsLoading() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <Skeleton className="h-9 w-32" />
        <Skeleton className="mt-2 h-5 w-64" />
      </div>

      <div className="mb-8">
        <Skeleton className="h-9 max-w-md" />
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-start gap-4 rounded-lg border p-6">
            <Skeleton className="h-16 w-16 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
