/**
 * Guest production bridge — turns an accepted application into a real episode
 * in the production pipeline.
 *
 * Before this, "accepted" only created/merged a canonical guest and stopped —
 * the story never entered production. Now acceptance also creates an Episode
 * Intelligence Record (EIR) in the `guest_assigned` phase, seeded from the
 * application and (if generated) the AI episode concept, so Khat Brain picks
 * the guest up. Idempotent: keyed on editorial_intent.source_id = applicationId.
 */

import { desc, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { episodeIntelligenceRecords } from "@/lib/db/schema/eir"
import { createEpisodeIntelligenceRecord, type EpisodePhase } from "@/lib/eir"
import { getGuestApplicationById, getGuestConcept } from "@/lib/admin/queries"
import { logActivity } from "@/lib/crm"

export interface LinkedEir {
  id: string
  phase: EpisodePhase | string
  working_title: string
}

/** The EIR created from a given application (null if not bridged yet). */
export async function getEirForApplication(applicationId: string): Promise<LinkedEir | null> {
  if (!db) return null
  const [row] = await db
    .select({
      id: episodeIntelligenceRecords.id,
      phase: episodeIntelligenceRecords.phase,
      working_title: episodeIntelligenceRecords.working_title,
    })
    .from(episodeIntelligenceRecords)
    .where(sql`${episodeIntelligenceRecords.editorial_intent}->>'source_id' = ${applicationId}`)
    .orderBy(desc(episodeIntelligenceRecords.created_at))
    .limit(1)
  return row ? { id: row.id, phase: row.phase, working_title: row.working_title } : null
}

/**
 * Create the production EIR for an accepted application, once. Returns the
 * existing one if it's already been bridged. No-op (returns null) if the
 * application is missing.
 */
export async function bridgeApplicationToProduction(input: {
  applicationId: string
  guestId: string
  actorId?: string | null
}): Promise<{ eir_id: string; created: boolean } | null> {
  const { applicationId, guestId, actorId } = input

  // Idempotency: one production EIR per application.
  const existing = await getEirForApplication(applicationId)
  if (existing) return { eir_id: existing.id, created: false }

  const app = await getGuestApplicationById(applicationId)
  if (!app) return null
  const concept = await getGuestConcept(applicationId)

  const workingTitle =
    (concept?.status === "ready" && concept.proposed_episode_title) || `حلقة مع ${app.name}`

  const productionNotes = [
    app.topics_to_avoid ? `مواضيع يُفضّل تجنّبها: ${app.topics_to_avoid}` : null,
    concept?.host_preparation_notes || null,
  ]
    .filter(Boolean)
    .join("\n")

  const eir = await createEpisodeIntelligenceRecord({
    working_title: workingTitle,
    phase: "guest_assigned",
    guest_id: guestId,
    editorial_intent: {
      source: "guest_application",
      source_id: applicationId,
      hook: concept?.episode_hook || app.story_idea,
      why_matters: concept?.why_this_episode_matters || app.hope_people_understand,
      goal: app.hope_people_understand,
      description: app.beyond_job_title,
      suggested_questions: concept?.suggested_core_questions?.length
        ? concept.suggested_core_questions
        : undefined,
      production_notes: productionNotes || undefined,
    },
    created_by: actorId ?? "system:casting",
  })

  await logActivity("guest", applicationId, {
    type: "production_bridged",
    summary: `دخلت القصة خط الإنتاج — حلقة "${workingTitle}"`,
    actor: actorId ?? "system:casting",
    metadata: { eir_id: eir.id, phase: eir.phase },
  })

  return { eir_id: eir.id, created: true }
}
