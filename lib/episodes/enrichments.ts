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
    publish_status: (row.publish_status as string) || "published",
    scheduled_for:
      row.scheduled_for instanceof Date
        ? row.scheduled_for.toISOString()
        : (row.scheduled_for as string) || null,
    updatedAt: (row.updated_at as string) || new Date().toISOString(),
  }
}

/**
 * Publish gate (P6) — is the enriched knowledge-hub content public yet?
 * INERT-FIRST: a missing/empty status counts as published, so existing rows
 * keep showing. Public only when status='published' AND not scheduled in the
 * future. `now` is injectable for deterministic tests.
 */
export function isEnrichmentPublic(
  enrichment: Pick<EpisodeEnrichment, "publish_status" | "scheduled_for"> | null | undefined,
  now: number = Date.now(),
): boolean {
  if (!enrichment) return false
  // `||` (not `??`) so an empty-string status is self-defensively treated as
  // published, even if a future caller bypasses rowToEnrichment's normalization.
  const status = enrichment.publish_status || "published"
  if (status !== "published") return false
  if (enrichment.scheduled_for) {
    const due = Date.parse(enrichment.scheduled_for)
    if (Number.isFinite(due) && due > now) return false
  }
  return true
}

/** Ungated read — admin/internal use (returns enrichment regardless of gate). */
export async function getEpisodeEnrichment(episodeId: string): Promise<EpisodeEnrichment | null> {
  if (!db) return null

  const rows = await db.select().from(episodeEnrichments)
    .where(eq(episodeEnrichments.episode_id, episodeId))
    .limit(1)
  if (rows[0]) return rowToEnrichment(rows[0] as unknown as Record<string, unknown>)
  return null
}

/**
 * Public read — returns the enrichment ONLY when its publish gate is open.
 * Use on public surfaces so unpublished/scheduled knowledge-hub content stays
 * hidden. Admin surfaces keep using getEpisodeEnrichment.
 */
export async function getPublicEpisodeEnrichment(episodeId: string): Promise<EpisodeEnrichment | null> {
  const enrichment = await getEpisodeEnrichment(episodeId)
  return isEnrichmentPublic(enrichment) ? enrichment : null
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

/**
 * Set the publish gate (P6) for an episode's enriched content. Creates the
 * enrichment row if absent (so an episode can be pre-gated before content
 * lands). Returns the effective status.
 */
export async function setEnrichmentPublishStatus(
  episodeId: string,
  publishStatus: string,
  scheduledFor: string | null = null,
): Promise<{ publish_status: string; scheduled_for: string | null }> {
  if (!db) throw new Error("Database not available")
  const scheduled = scheduledFor ? new Date(scheduledFor) : null
  await db
    .insert(episodeEnrichments)
    .values({ episode_id: episodeId, publish_status: publishStatus, scheduled_for: scheduled })
    .onConflictDoUpdate({
      target: episodeEnrichments.episode_id,
      set: { publish_status: publishStatus, scheduled_for: scheduled, updated_at: new Date() },
    })
  return { publish_status: publishStatus, scheduled_for: scheduled ? scheduled.toISOString() : null }
}
