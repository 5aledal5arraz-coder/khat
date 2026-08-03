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
    unsaid_reflections_approved: (row.unsaid_reflections_approved as string[]) || undefined,
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
 *
 * ⚠️ This gate is INERT-FIRST **on purpose** and must stay that way: it was
 * added to rows that were already live, so "no opinion recorded" has to mean
 * "keep showing" or shipping it would have blanked every published episode.
 * `publicUnsaidReflections()` below is its deliberate OPPOSITE — read the note
 * there before reconciling the two. They are not in conflict; they answer
 * different questions about different content.
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

/**
 * ص-٩ — per-ITEM review gate for «ما لم يُقال». Returns only the reflections
 * Khaled has explicitly approved for the public page, in the author's order.
 *
 * WHY THIS ONE FIELD, AND WHY DEFAULT-DENY
 * The other four generated conversation fields describe the episode. This one
 * states what the guest did NOT say — and a review of nine generated items
 * found the sharpest of them ("… التلاعب …") also the least reproducible
 * between runs: the highest-liability sentence was the least stable one, on a
 * page that names a real person. So the decision (Khaled, ص-٩) is that nothing
 * here reaches the public page by silence, default, or accident.
 *
 * ⚠️ DELIBERATE INVERSION of `isEnrichmentPublic()` above. That gate is
 * INERT-FIRST (no opinion ⇒ visible) because it was retrofitted onto content
 * that was ALREADY published and must not disappear. This gate is
 * DEFAULT-DENY (no opinion ⇒ hidden) because it guards content that has never
 * been published and whose failure mode is an unreviewed accusation going
 * live. Neither is a bug, and neither is a precedent for the other: pick
 * inert-first when the risk is hiding something that already shipped, and
 * default-deny when the risk is publishing something nobody read.
 *
 * Approval is keyed by the item's exact TEXT, not its index, so a re-worded
 * item silently loses its approval instead of inheriting it, and reordering or
 * deleting items cannot shift an approval onto a different sentence.
 */
export function publicUnsaidReflections(
  enrichment:
    | Pick<EpisodeEnrichment, "unsaid_reflections" | "unsaid_reflections_approved">
    | null
    | undefined,
): string[] {
  const items = enrichment?.unsaid_reflections
  const approved = enrichment?.unsaid_reflections_approved
  if (!Array.isArray(items) || items.length === 0) return []
  if (!Array.isArray(approved) || approved.length === 0) return []
  const allowed = new Set(approved.map((s) => (typeof s === "string" ? s.trim() : "")))
  allowed.delete("")
  return items.filter((item) => typeof item === "string" && allowed.has(item.trim()))
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
 *
 * ص-٩ — `unsaid_reflections` is additionally filtered to the approved items
 * HERE, at the single read every public surface goes through, rather than in
 * the page component. A future public consumer that forgets the gate is the
 * exact way an unreviewed item would reach the site, so the gate is applied
 * where it cannot be forgotten. Unapproved ⇒ the field comes back `undefined`,
 * which is what `<UnsaidReflections>` already renders as "no section at all".
 */
export async function getPublicEpisodeEnrichment(episodeId: string): Promise<EpisodeEnrichment | null> {
  const enrichment = await getEpisodeEnrichment(episodeId)
  if (!isEnrichmentPublic(enrichment) || !enrichment) return null
  const approved = publicUnsaidReflections(enrichment)
  return {
    ...enrichment,
    unsaid_reflections: approved.length > 0 ? approved : undefined,
  }
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
    // ص-٩ — callers that can change approval (the admin form) always send an
    // explicit array, so `[]` here means "Khaled un-approved everything" and
    // must be written, not merged away. `undefined` still means "not my field"
    // — which is what the AI generator sends, so generating can never approve.
    unsaid_reflections_approved:
      enrichment.unsaid_reflections_approved ?? existing?.unsaid_reflections_approved as string[] ?? [],
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
      unsaid_reflections_approved: row.unsaid_reflections_approved,
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
