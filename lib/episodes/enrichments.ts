import { db } from "@/lib/db"
import { episodeEnrichments } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import type { EpisodeEnrichment } from "@/types/episodes"

// DB row → app type
function rowToEnrichment(row: Record<string, unknown>): EpisodeEnrichment {
  return {
    episodeId: row.episode_id as string,
    hero_summary: (row.hero_summary as string) || undefined,
    full_summary: (row.full_summary as string) || undefined,
    takeaways: (row.takeaways as string[]) || undefined,
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
  if (!db) return null

  const rows = await db.select().from(episodeEnrichments)
    .where(eq(episodeEnrichments.episode_id, episodeId))
    .limit(1)
  if (rows[0]) return rowToEnrichment(rows[0] as unknown as Record<string, unknown>)
  return null
}

export async function setEpisodeEnrichment(enrichment: EpisodeEnrichment): Promise<void> {
  if (!db) throw new Error("Database not available")

  // Fetch existing to merge (preserves fields not being updated)
  const existingRows = await db.select().from(episodeEnrichments)
    .where(eq(episodeEnrichments.episode_id, enrichment.episodeId))
    .limit(1)
  const existing = (existingRows[0] as unknown as Record<string, unknown>) || null

  const row = {
    episode_id: enrichment.episodeId,
    hero_summary: enrichment.hero_summary ?? existing?.hero_summary as string ?? null,
    full_summary: enrichment.full_summary ?? existing?.full_summary as string ?? null,
    takeaways: enrichment.takeaways ?? existing?.takeaways as string[] ?? [],
    resources: enrichment.resources ?? existing?.resources as unknown[] ?? [],
    timestamps: enrichment.timestamps ?? existing?.timestamps as unknown[] ?? [],
    why_this_conversation: enrichment.why_this_conversation ?? existing?.why_this_conversation as string ?? null,
    before_you_watch: enrichment.before_you_watch ?? existing?.before_you_watch ?? null,
    conversation_map: enrichment.conversation_map ?? existing?.conversation_map ?? null,
    central_question: enrichment.central_question ?? existing?.central_question as string ?? null,
    exclusive_clip: enrichment.exclusive_clip ?? existing?.exclusive_clip ?? null,
    unsaid_reflections: enrichment.unsaid_reflections ?? existing?.unsaid_reflections as string[] ?? [],
  }

  await db.insert(episodeEnrichments).values(row).onConflictDoUpdate({
    target: episodeEnrichments.episode_id,
    set: {
      hero_summary: row.hero_summary,
      full_summary: row.full_summary,
      takeaways: row.takeaways,
      resources: row.resources,
      timestamps: row.timestamps,
      why_this_conversation: row.why_this_conversation,
      before_you_watch: row.before_you_watch,
      conversation_map: row.conversation_map,
      central_question: row.central_question,
      exclusive_clip: row.exclusive_clip,
      unsaid_reflections: row.unsaid_reflections,
    },
  })
}

export async function deleteEpisodeEnrichment(episodeId: string): Promise<void> {
  if (!db) throw new Error("Database not available")
  await db.delete(episodeEnrichments).where(eq(episodeEnrichments.episode_id, episodeId))
}
