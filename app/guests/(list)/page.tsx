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
    // TWO COLUMNS, NOT THREE. The card is the episode-cover composition and it
    // holds its 16:9 at every width, so a third column shrinks it to ~355px —
    // the name drops onto its pixel floor and the panel, the rule and the
    // diamond crowd each other. At two the card is ~560px and reads as the
    // drawing it is.
    //
    // NO EPISODE COUNT. The card this replaced printed one behind
    // `guest.episode_count !== undefined` — and `getGuests()` has never
    // selected that column, so the line rendered for nobody. Not carried over.
    <div className="grid gap-6 sm:grid-cols-2">
      {guests.map((guest) => (
        <GuestCard key={guest.id} guest={guest} eyebrow="ضيف خط" as="h2" action={null} />
      ))}
    </div>
  )
}

function GuestsGridSkeleton() {
  return (
    // THE SKELETON IS THE CARD'S OWN BOX, and it has to keep being that. The
    // version this replaced was an 80px square beside two text bars, matching
    // the old list card; against a 16:9 card it would have collapsed the whole
    // grid the moment the data landed. Same columns, same gap, same aspect.
    <div className="grid gap-6 sm:grid-cols-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="aspect-[16/9] w-full rounded-2xl" />
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
