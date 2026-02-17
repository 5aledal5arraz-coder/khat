import { createConfigStore } from "@/lib/config-store"
import { createClient } from "@/lib/supabase/server"
import type { EpisodeEnrichment } from "@/types/episodes"

const USE_SUPABASE = !!(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !process.env.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder")
)

type EnrichmentsConfig = Record<string, EpisodeEnrichment>

const store = createConfigStore<EnrichmentsConfig>("episode-enrichments.json", {})

// DB row → app type
function rowToEnrichment(row: Record<string, unknown>): EpisodeEnrichment {
  return {
    episodeId: row.episode_id as string,
    hero_summary: (row.hero_summary as string) || undefined,
    full_summary: (row.full_summary as string) || undefined,
    takeaways: (row.takeaways as string[]) || undefined,
    topics: (row.topics as string[]) || undefined,
    resources: (row.resources as EpisodeEnrichment["resources"]) || undefined,
    timestamps: (row.timestamps as EpisodeEnrichment["timestamps"]) || undefined,
    why_this_conversation: (row.why_this_conversation as string) || undefined,
    before_you_watch: (row.before_you_watch as EpisodeEnrichment["before_you_watch"]) || undefined,
    conversation_map: (row.conversation_map as EpisodeEnrichment["conversation_map"]) || undefined,
    central_question: (row.central_question as string) || undefined,
    exclusive_clip: (row.exclusive_clip as EpisodeEnrichment["exclusive_clip"]) || undefined,
    unsaid_reflections: (row.unsaid_reflections as string[]) || undefined,
    updatedAt: (row.updated_at as string) || new Date().toISOString(),
  }
}

export async function getEpisodeEnrichment(episodeId: string): Promise<EpisodeEnrichment | null> {
  if (USE_SUPABASE) {
    try {
      const supabase = await createClient()
      const { data, error } = await supabase
        .from("episode_enrichments")
        .select("*")
        .eq("episode_id", episodeId)
        .maybeSingle()

      if (!error && data) return rowToEnrichment(data)
      if (!error && !data) return null
      if (error) console.error("getEpisodeEnrichment DB error:", error.message)
    } catch (e) {
      console.error("getEpisodeEnrichment DB exception:", e)
    }
  }

  const config = await store.read()
  return config[episodeId] || null
}

export async function setEpisodeEnrichment(enrichment: EpisodeEnrichment): Promise<void> {
  if (USE_SUPABASE) {
    try {
      const supabase = await createClient()

      // Fetch existing to merge (preserves fields not being updated)
      const { data: existing } = await supabase
        .from("episode_enrichments")
        .select("*")
        .eq("episode_id", enrichment.episodeId)
        .maybeSingle()

      const row: Record<string, unknown> = {
        episode_id: enrichment.episodeId,
        hero_summary: enrichment.hero_summary ?? existing?.hero_summary ?? null,
        full_summary: enrichment.full_summary ?? existing?.full_summary ?? null,
        takeaways: enrichment.takeaways ?? existing?.takeaways ?? [],
        topics: enrichment.topics ?? existing?.topics ?? [],
        resources: enrichment.resources ?? existing?.resources ?? [],
        timestamps: enrichment.timestamps ?? existing?.timestamps ?? [],
        why_this_conversation: enrichment.why_this_conversation ?? existing?.why_this_conversation ?? null,
        before_you_watch: enrichment.before_you_watch ?? existing?.before_you_watch ?? null,
        conversation_map: enrichment.conversation_map ?? existing?.conversation_map ?? null,
        central_question: enrichment.central_question ?? existing?.central_question ?? null,
        exclusive_clip: enrichment.exclusive_clip ?? existing?.exclusive_clip ?? null,
        unsaid_reflections: enrichment.unsaid_reflections ?? existing?.unsaid_reflections ?? [],
      }

      const { error } = await supabase.from("episode_enrichments").upsert(row)
      if (!error) return
      console.error("setEpisodeEnrichment DB error:", error.message)
    } catch (e) {
      console.error("setEpisodeEnrichment DB exception:", e)
    }
  }

  const config = await store.read()
  const existing = config[enrichment.episodeId]
  const merged = { ...existing, ...enrichment }
  // Strip keys set to undefined so fields can be cleared
  for (const key of Object.keys(merged) as (keyof EpisodeEnrichment)[]) {
    if (merged[key] === undefined) {
      delete merged[key]
    }
  }
  config[enrichment.episodeId] = merged
  await store.write(config)
}

export async function deleteEpisodeEnrichment(episodeId: string): Promise<void> {
  if (USE_SUPABASE) {
    try {
      const supabase = await createClient()
      const { error } = await supabase
        .from("episode_enrichments")
        .delete()
        .eq("episode_id", episodeId)
      if (!error) return
      console.error("deleteEpisodeEnrichment DB error:", error.message)
    } catch (e) {
      console.error("deleteEpisodeEnrichment DB exception:", e)
    }
  }

  const config = await store.read()
  delete config[episodeId]
  await store.write(config)
}
