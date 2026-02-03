import { Skeleton } from "@/components/ui/skeleton"

export default function EpisodesLoading() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <Skeleton className="h-9 w-32" />
        <Skeleton className="mt-2 h-5 w-48" />
      </div>

      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center">
        <Skeleton className="h-9 flex-1" />
        <Skeleton className="h-9 w-32" />
        <Skeleton className="h-9 w-32" />
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="space-y-3">
            <Skeleton className="aspect-video w-full rounded-xl" />
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <div className="flex gap-2">
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
