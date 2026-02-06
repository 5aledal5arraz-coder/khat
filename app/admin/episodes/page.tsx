import { getEpisodes } from "@/lib/supabase/queries"
import { getEpisodeOverrides } from "@/lib/episode-overrides"
import { getSectionsConfig } from "@/lib/episode-sections"
import { EpisodesList } from "./episodes-list"

export default async function EpisodesAdminPage() {
  const [episodes, overrides, sectionsConfig] = await Promise.all([
    getEpisodes({ limit: 100, includeHidden: true }),
    getEpisodeOverrides(),
    getSectionsConfig(),
  ])

  const episodesData = episodes.map((ep) => ({
    id: ep.id,
    title: ep.title,
    youtube_url: ep.youtube_url,
    release_date: ep.release_date,
  }))

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">إدارة الحلقات</h1>
        <p className="mt-1 text-muted-foreground">
          تعديل عناوين الحلقات وإدارة المحتوى
        </p>
      </div>

      <EpisodesList
        episodes={episodesData}
        overrides={overrides}
        sectionsConfig={sectionsConfig}
      />
    </div>
  )
}
