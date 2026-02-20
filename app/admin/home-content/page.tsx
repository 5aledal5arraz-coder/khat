import { getAllHomeQuotes } from "@/lib/home-quotes"
import { getAllReflections } from "@/lib/daily-reflections"
import { getAllPaths } from "@/lib/emotional-paths"
import { getEpisodes } from "@/lib/queries/episodes"
import { getTeaserSettings, getAllQuestions, getTeaserQuestionStats } from "@/lib/teaser"
import { HomeContentTabs } from "./home-content-tabs"
import { AdminPageHeader } from "../components/admin-page-header"

export default async function HomeContentPage() {
  const [quotes, reflections, paths, episodes, teaserSettings] = await Promise.all([
    getAllHomeQuotes(),
    getAllReflections(),
    getAllPaths(),
    getEpisodes({ limit: 100 }),
    getTeaserSettings(),
  ])

  // Load questions for the active or first teaser
  const activeTeaser = teaserSettings.teasers.find((t) => t.isActive) || teaserSettings.teasers[0]
  const [teaserQuestions, teaserStats] = activeTeaser
    ? await Promise.all([
        getAllQuestions(activeTeaser.id),
        getTeaserQuestionStats(activeTeaser.id),
      ])
    : [[], null]

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="الصفحة الرئيسية"
        description="إدارة محتوى الصفحة الرئيسية — الاقتباسات والتأملات والمسارات واسأل الضيف"
      />

      <HomeContentTabs
        quotes={quotes}
        reflections={reflections}
        paths={paths}
        episodes={episodes}
        teasers={teaserSettings.teasers}
        teaserQuestions={teaserQuestions}
        teaserStats={teaserStats}
      />
    </div>
  )
}
