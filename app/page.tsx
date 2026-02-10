import { getEpisodes, getGuests } from "@/lib/supabase/queries"
import { getTodaysQuote } from "@/lib/home-quotes"
import { getTodaysReflection } from "@/lib/daily-reflections"
import { getAllPaths } from "@/lib/emotional-paths"
import { HeroPauseMoment } from "@/components/home/hero-pause-moment"
import { EmotionalPathsSection } from "@/components/home/emotional-paths-section"
import { TodayInKhat } from "@/components/home/today-in-khat"
import { DeepContentSection } from "@/components/home/deep-content-section"
import { BelongingSection } from "@/components/home/belonging-section"
import { mockHomeQuotes, mockDailyReflection } from "@/lib/mock-data"

export default async function HomePage() {
  const [todaysQuote, todaysReflection, paths, episodes, guests] = await Promise.all([
    getTodaysQuote(),
    getTodaysReflection(),
    getAllPaths(),
    getEpisodes({ limit: 6 }),
    getGuests(),
  ])

  // Use mock data as fallback when no content has been published yet
  const quote = todaysQuote ?? mockHomeQuotes[0] ?? null
  const reflection = todaysReflection ?? mockDailyReflection

  return (
    <div className="container mx-auto px-4">
      <div className="mx-auto max-w-2xl">
        {/* Section 1: Daily quote — psychological entry point */}
        <HeroPauseMoment quote={quote} />

        {/* Section 2: Emotional paths — "What do you want to listen to today?" */}
        <EmotionalPathsSection paths={paths} />

        {/* Section 3: Today in KHAT — daily reflection */}
        <TodayInKhat reflection={reflection} />

        {/* Section 4: Deep content — episodes + guests */}
        <DeepContentSection episodes={episodes} guests={guests} />

        {/* Section 5: Belonging — calm newsletter signup */}
        <BelongingSection />
      </div>
    </div>
  )
}
