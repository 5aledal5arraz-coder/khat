import { cookies } from "next/headers"
import { getEpisodes, getGuests } from "@/lib/supabase/queries"
import { getTodaysQuote, getPublishedHomeQuotes } from "@/lib/home-quotes"
import { getTodaysReflection } from "@/lib/daily-reflections"
import { getAllPaths } from "@/lib/emotional-paths"
import { getActiveTeaser } from "@/lib/teaser"
import { isEnabled } from "@/config/site"
import { personalizeHome } from "@/lib/personalization/ranking"
import { getPersonalizedContent } from "@/lib/personalization/recommend"
import { ComingSoon } from "@/components/coming-soon"
import { HeroPauseMoment } from "@/components/home/hero-pause-moment"
import { EmotionalPathsSection } from "@/components/home/emotional-paths-section"
import { TodayInKhat } from "@/components/home/today-in-khat"
import { DeepContentSection } from "@/components/home/deep-content-section"
import { BelongingSection } from "@/components/home/belonging-section"
import { AskTheGuest } from "@/components/home/ask-the-guest"
import { BecauseYouWatched } from "@/components/home/because-you-watched"
import { RecommendedForYou } from "@/components/home/recommended-for-you"
import type { PersonalizedHome } from "@/types/personalization"

export default async function HomePage() {
  const maintenanceMode = await isEnabled("maintenanceMode")
  if (maintenanceMode) return <ComingSoon />
  // Step 1: Fetch everything that can run in parallel (no sequential waterfall)
  const [
    todaysQuote,
    todaysReflection,
    paths,
    episodes,
    guests,
    activeTeaser,
    personalizationOn,
    allQuotes,
    cookieStore,
  ] = await Promise.all([
    getTodaysQuote(),
    getTodaysReflection(),
    getAllPaths(),
    getEpisodes({ limit: 20 }),
    getGuests(),
    getActiveTeaser(),
    isEnabled("personalizationEnabled"),
    getPublishedHomeQuotes(),
    cookies(),
  ])

  const visitorId = cookieStore.get("khat_vid")?.value ?? null

  // Step 2: Run both personalization systems in parallel (they share no dependency)
  let personalized: PersonalizedHome | null = null
  let recommended: Awaited<ReturnType<typeof getPersonalizedContent>> | null = null

  if (personalizationOn) {
    ;[personalized, recommended] = await Promise.all([
      personalizeHome(visitorId, {
        episodes,
        allQuotes,
        paths,
        defaultQuote: todaysQuote,
      }),
      getPersonalizedContent(visitorId, episodes),
    ])
  }

  const displayEpisodes = personalized?.episodes ?? episodes
  const displayQuote = personalized?.quote ?? todaysQuote
  const displayPaths = personalized?.paths ?? paths
  const becauseYouWatched = personalized?.becauseYouWatched ?? null
  const recommendationReason = personalized?.reason ?? null

  // Collect episode IDs already shown in recommendation sections to avoid duplicates
  const shownEpisodeIds = new Set<string>()
  if (becauseYouWatched) {
    for (const ep of becauseYouWatched.episodes) shownEpisodeIds.add(ep.id)
  }
  if (recommended?.reason) {
    for (const ep of recommended.episodes) shownEpisodeIds.add(ep.id)
  }

  return (
    <div className="container mx-auto px-4">
      <div className="mx-auto max-w-2xl">
        {/* Section 1: Daily quote — psychological entry point */}
        <HeroPauseMoment quote={displayQuote} />

        {/* Ask the Guest — shown only when a teaser is active */}
        {activeTeaser && (
          <AskTheGuest
            teaser={activeTeaser.teaser}
            questions={activeTeaser.questions}
          />
        )}

        {/* Section 2: Emotional paths — "What do you want to listen to today?" */}
        <EmotionalPathsSection paths={displayPaths} />

        {/* Section 3: Today in KHAT — daily reflection */}
        <TodayInKhat reflection={todaysReflection} />

        {/* Because You Watched — personalized recommendations */}
        {becauseYouWatched && (
          <BecauseYouWatched
            sourceTitle={becauseYouWatched.sourceTitle}
            episodes={becauseYouWatched.episodes}
          />
        )}

        {/* مقترح لك — profile-based recommendations */}
        {recommended?.reason && (
          <RecommendedForYou
            episodes={recommended.episodes}
            quote={recommended.quote}
            reflection={recommended.reflection}
            reason={recommended.reason}
          />
        )}

        {/* Section 4: Deep content — episodes + guests */}
        <DeepContentSection
          episodes={displayEpisodes}
          guests={guests}
          recommendationReason={recommendationReason}
          excludeEpisodeIds={shownEpisodeIds}
        />

        {/* Section 5: Belonging — calm newsletter signup */}
        <BelongingSection />
      </div>
    </div>
  )
}
