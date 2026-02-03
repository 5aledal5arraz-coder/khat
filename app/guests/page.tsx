import { Suspense } from "react"
import { Metadata } from "next"
import { getGuests } from "@/lib/supabase/queries"
import { GuestCard } from "@/components/guests/guest-card"
import { GuestSearch } from "@/components/guests/guest-search"
import { Skeleton } from "@/components/ui/skeleton"

export const metadata: Metadata = {
  title: "الضيوف",
  description: "تعرف على ضيوف بودكاست خط",
}

interface GuestsPageProps {
  searchParams: Promise<{
    search?: string
  }>
}

async function GuestsContent({ searchParams }: { searchParams: Awaited<GuestsPageProps['searchParams']> }) {
  const guests = await getGuests({
    search: searchParams.search,
  })

  if (guests.length === 0) {
    return (
      <div className="py-12 text-center">
        <p className="text-lg text-muted-foreground">
          لا يوجد ضيوف مطابقين للبحث
        </p>
      </div>
    )
  }

  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {guests.map((guest) => (
        <GuestCard key={guest.id} guest={guest} />
      ))}
    </div>
  )
}

function GuestsGridSkeleton() {
  return (
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
  )
}

export default async function GuestsPage({ searchParams }: GuestsPageProps) {
  const resolvedSearchParams = await searchParams

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">الضيوف</h1>
        <p className="mt-2 text-muted-foreground">
          تعرف على الضيوف الملهمين الذين شاركونا قصصهم
        </p>
      </div>

      <div className="mb-8">
        <GuestSearch />
      </div>

      <Suspense fallback={<GuestsGridSkeleton />}>
        <GuestsContent searchParams={resolvedSearchParams} />
      </Suspense>
    </div>
  )
}
