import { createConfigStore } from "@/lib/config-store"
import { pool, USE_DB } from "@/lib/db"
import type { EpisodeEnrichment } from "@/types/episodes"

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
  if (USE_DB) {
    try {
      const { rows } = await pool!.query(
        `SELECT * FROM episode_enrichments WHERE episode_id = $1 LIMIT 1`,
        [episodeId]
      )
      if (rows[0]) return rowToEnrichment(rows[0])
      return null
    } catch (e) {
      console.error("getEpisodeEnrichment DB exception:", e)
    }
  }

  const config = await store.read()
  return config[episodeId] || null
}

export async function setEpisodeEnrichment(enrichment: EpisodeEnrichment): Promise<void> {
  if (USE_DB) {
    try {
      // Fetch existing to merge (preserves fields not being updated)
      const { rows: existingRows } = await pool!.query(
        `SELECT * FROM episode_enrichments WHERE episode_id = $1 LIMIT 1`,
        [enrichment.episodeId]
      )
      const existing = existingRows[0] || null

      const row = {
        episode_id: enrichment.episodeId,
        hero_summary: enrichment.hero_summary ?? existing?.hero_summary ?? null,
        full_summary: enrichment.full_summary ?? existing?.full_summary ?? null,
        takeaways: JSON.stringify(enrichment.takeaways ?? existing?.takeaways ?? []),
        topics: JSON.stringify(enrichment.topics ?? existing?.topics ?? []),
        resources: JSON.stringify(enrichment.resources ?? existing?.resources ?? []),
        timestamps: JSON.stringify(enrichment.timestamps ?? existing?.timestamps ?? []),
        why_this_conversation: enrichment.why_this_conversation ?? existing?.why_this_conversation ?? null,
        before_you_watch: JSON.stringify(enrichment.before_you_watch ?? existing?.before_you_watch ?? null),
        conversation_map: JSON.stringify(enrichment.conversation_map ?? existing?.conversation_map ?? null),
        central_question: enrichment.central_question ?? existing?.central_question ?? null,
        exclusive_clip: JSON.stringify(enrichment.exclusive_clip ?? existing?.exclusive_clip ?? null),
        unsaid_reflections: JSON.stringify(enrichment.unsaid_reflections ?? existing?.unsaid_reflections ?? []),
      }

      await pool!.query(
        `INSERT INTO episode_enrichments (episode_id, hero_summary, full_summary, takeaways, topics, resources, timestamps, why_this_conversation, before_you_watch, conversation_map, central_question, exclusive_clip, unsaid_reflections)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         ON CONFLICT (episode_id) DO UPDATE SET
           hero_summary = EXCLUDED.hero_summary,
           full_summary = EXCLUDED.full_summary,
           takeaways = EXCLUDED.takeaways,
           topics = EXCLUDED.topics,
           resources = EXCLUDED.resources,
           timestamps = EXCLUDED.timestamps,
           why_this_conversation = EXCLUDED.why_this_conversation,
           before_you_watch = EXCLUDED.before_you_watch,
           conversation_map = EXCLUDED.conversation_map,
           central_question = EXCLUDED.central_question,
           exclusive_clip = EXCLUDED.exclusive_clip,
           unsaid_reflections = EXCLUDED.unsaid_reflections`,
        [
          row.episode_id, row.hero_summary, row.full_summary,
          row.takeaways, row.topics, row.resources, row.timestamps,
          row.why_this_conversation, row.before_you_watch, row.conversation_map,
          row.central_question, row.exclusive_clip, row.unsaid_reflections,
        ]
      )
      return
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
  if (USE_DB) {
    try {
      await pool!.query(
        `DELETE FROM episode_enrichments WHERE episode_id = $1`,
        [episodeId]
      )
      return
    } catch (e) {
      console.error("deleteEpisodeEnrichment DB exception:", e)
    }
  }

  const config = await store.read()
  delete config[episodeId]
  await store.write(config)
}
