import { getEpisodes } from "@/lib/queries/episodes"
import { getHomepageFeatured, getLatestEpisodesForHomepage } from "@/lib/queries/homepage-featured"
import { getHomepageThinkers, getLatestGuestsForHomepage } from "@/lib/queries/homepage-thinkers"
import { getAllGuests } from "@/lib/admin/queries"
import { getAllHomepageSettings } from "@/lib/queries/homepage-settings"
import { listTopics, getTopicsForEpisodes } from "@/lib/queries/topics"
import { HOMEPAGE_FILTER_KEY } from "@/lib/homepage/hall"
import {
  getTeaserSettings,
  getUpcomingEpisodesForTeaser,
  countPendingTeaserQuestions,
} from "@/lib/teaser"
import { HomeContentTabs } from "./home-content-tabs"
import { AdminPageHeader } from "../components/admin-page-header"

export const dynamic = "force-dynamic"

export default async function HomeContentPage() {
  const [
    allEpisodes,
    featuredRows,
    latestEpisodes,
    allGuests,
    thinkerRows,
    latestGuests,
    settings,
    teaserSettings,
    upcomingEpisodes,
    pendingQuestions,
    topics,
  ] = await Promise.all([
    getEpisodes({ limit: 100, withCategories: true }),
    getHomepageFeatured(),
    getLatestEpisodesForHomepage(),
    getAllGuests(),
    getHomepageThinkers(),
    getLatestGuestsForHomepage(),
    getAllHomepageSettings(),
    getTeaserSettings(),
    getUpcomingEpisodesForTeaser(),
    countPendingTeaserQuestions(),
    listTopics(),
  ])

  const featuredMode = (settings.featured_mode === "manual" ? "manual" : "auto") as "auto" | "manual"
  const thinkersMode = (settings.thinkers_mode === "manual" ? "manual" : "auto") as "auto" | "manual"
  const featuredFilter = settings[HOMEPAGE_FILTER_KEY] || "newest"

  // The programme lanes an auto filter can point at, with live counts. Built
  // from the episodes themselves rather than from `episode_categories`, so a
  // category with nothing published in it never shows up as a choosable filter
  // that would empty the homepage.
  const programCounts = new Map<string, { slug: string; name: string; count: number }>()
  for (const ep of allEpisodes) {
    const c = ep.category
    if (!c?.slug) continue
    const seen = programCounts.get(c.slug)
    if (seen) seen.count += 1
    else programCounts.set(c.slug, { slug: c.slug, name: c.name, count: 1 })
  }
  const programs = [...programCounts.values()].sort((a, b) => b.count - a.count)

  // EVERY published episode is taggable, «سالفة» and «مقاطع خط» included. The
  // clips carry the subject of the conversation they were cut from, so a topic
  // filter surfaces both the full episode and its excerpt — which only works if
  // the operator can see and edit the clips' tags here too.
  const taggable = allEpisodes
  const episodeTopics = await getTopicsForEpisodes(taggable.map((e) => e.id))

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="الصفحة الرئيسية"
        description="إدارة محتوى الصفحة الرئيسية — معرض الحلقات ومعرض العقول"
      />

      <HomeContentTabs
        allEpisodes={allEpisodes}
        featuredRows={featuredRows}
        latestEpisodes={latestEpisodes}
        allGuests={allGuests}
        thinkerRows={thinkerRows}
        latestGuests={latestGuests}
        featuredMode={featuredMode}
        thinkersMode={thinkersMode}
        featuredFilter={featuredFilter}
        programs={programs}
        topics={topics}
        taggableEpisodes={taggable}
        episodeTopics={episodeTopics}
        teasers={teaserSettings.teasers}
        upcomingEpisodes={upcomingEpisodes}
        pendingQuestions={pendingQuestions}
      />
    </div>
  )
}
