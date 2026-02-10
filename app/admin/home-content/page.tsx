import { getAllHomeQuotes } from "@/lib/home-quotes"
import { getAllReflections } from "@/lib/daily-reflections"
import { getAllPaths } from "@/lib/emotional-paths"
import { getEpisodes } from "@/lib/supabase/queries"
import { HomeContentTabs } from "./home-content-tabs"

export default async function HomeContentPage() {
  const [quotes, reflections, paths, episodes] = await Promise.all([
    getAllHomeQuotes(),
    getAllReflections(),
    getAllPaths(),
    getEpisodes({ limit: 100 }),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">الصفحة الرئيسية</h1>
        <p className="text-muted-foreground">إدارة محتوى الصفحة الرئيسية — الاقتباسات والتأملات والمسارات</p>
      </div>

      <HomeContentTabs
        quotes={quotes}
        reflections={reflections}
        paths={paths}
        episodes={episodes}
      />
    </div>
  )
}
