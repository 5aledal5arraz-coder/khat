import type { Metadata } from "next"
import { Suspense } from "react"
import { getEpisodes } from "@/lib/queries/episodes"
import { mockEpisodes } from "@/lib/mocks/episodes"
import { WriteEditor, type EpisodeOption } from "./write-editor"

export const metadata: Metadata = {
  title: "اكتب في حبر",
  description: "شارك أفكارك ومقالاتك في مجتمع حبر.",
}

async function getEpisodeOptions(): Promise<EpisodeOption[]> {
  try {
    const episodes = await getEpisodes({ limit: 50 })
    if (episodes.length > 0) {
      return episodes.map((e) => ({ id: e.id, title: e.title, slug: e.slug }))
    }
  } catch {
    // Fall through to mock data
  }
  return mockEpisodes.map((e) => ({ id: e.id, title: e.title, slug: e.slug }))
}

export default async function WritePage() {
  const episodes = await getEpisodeOptions()

  return (
    <Suspense fallback={
      <div className="container mx-auto flex min-h-[60vh] items-center justify-center px-4 py-8">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    }>
      <WriteEditor episodes={episodes} />
    </Suspense>
  )
}
