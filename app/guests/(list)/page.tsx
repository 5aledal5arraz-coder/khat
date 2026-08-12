import { Suspense } from "react"
import { Metadata } from "next"
import { getGuests } from "@/lib/queries/episodes"
import { GuestCard } from "@/components/guests/guest-card"
import { GuestSearch } from "@/components/guests/guest-search"
import { Skeleton } from "@/components/ui/skeleton"

// Admin panel (DB) is the single source of truth — render on every request.
export const dynamic = "force-dynamic"

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
  let guests
  try {
    guests = await getGuests({
      search: searchParams.search,
    })
  } catch (error) {
    console.error("[GuestsPage] Failed to fetch guests:", error)
    return (
      <div className="py-12 text-center">
        <p className="text-lead text-muted-foreground">
          تعذّر تحميل الضيوف حالياً. يرجى المحاولة لاحقاً.
        </p>
      </div>
    )
  }

  if (guests.length === 0) {
    return (
      <div className="py-12 text-center">
        <p className="text-lead text-muted-foreground">
          {searchParams.search ? "لا يوجد ضيوف مطابقين للبحث" : "لا يوجد ضيوف بعد"}
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
          {/* 80px rounded square — the exact box `GuestPortrait variant="card"`
              settles into. It was `h-16 w-16 rounded-full`: 64px against an
              80px avatar, so every card jumped 16px sideways and changed shape
              the moment the data landed. */}
          <Skeleton className="h-20 w-20 rounded-2xl" />
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
        {/* Matches /episodes, which is `text-title`. These two index pages are
            siblings and were 32px vs 44px. */}
        <h1 className="text-heading font-bold sm:text-title">الضيوف</h1>
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
