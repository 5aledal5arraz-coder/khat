import { getStudioSessions } from "@/lib/studio"
import { getEpisodes } from "@/lib/queries/episodes"
import { getSectionsConfig } from "@/lib/episode-sections"
import { StudioClient } from "./studio-client"

export const dynamic = "force-dynamic"

export default async function StudioPage() {
  const [sessions, episodes, sectionsConfig] = await Promise.all([
    getStudioSessions(),
    getEpisodes({ includeHidden: true }),
    getSectionsConfig(),
  ])

  const sessionCount = sessions.length
  const episodeCount = episodes.length

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-bold">الاستوديو</h1>
        <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
          {sessionCount} جلسة
        </span>
        <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
          {episodeCount} حلقة
        </span>
      </div>
      <StudioClient
        initialSessions={sessions}
        episodes={episodes}
        sectionsConfig={sectionsConfig}
      />
    </div>
  )
}
