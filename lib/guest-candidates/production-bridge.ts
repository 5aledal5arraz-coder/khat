/**
 * Guest candidate → production bridge.
 *
 * Turns an ACCEPTED, canonically-linked guest candidate into a real episode
 * (an EIR) in the `guest_assigned` phase. Mirrors lib/guest-crm/production-bridge.ts
 * (the guest-application bridge) but for the standalone guest_candidates pipeline.
 *
 * CRITICAL (Phase-1 lesson — the studio-on-open EIR bug): this NEVER runs
 * implicitly. It is invoked ONLY from the explicit admin "نقل للإنتاج"
 * endpoint, which gates on candidate.status === "accepted" + an existing
 * canonical-guest link. No page load, status change, or preview creates an EIR.
 *
 * Idempotent: keyed on editorial_intent.source_id = candidateId (+ source =
 * "guest_candidate"). Soft-link only — no FK; guest_candidates stays standalone.
 */

import { and, desc, eq, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { episodeIntelligenceRecords } from "@/lib/db/schema/eir"
import { guestCandidates } from "@/lib/db/schema/guest-candidates"
import { guestCandidateLinks } from "@/lib/db/schema/guest-identity"
import { createEpisodeIntelligenceRecord, type EpisodePhase } from "@/lib/eir"

export interface LinkedCandidateEir {
  id: string
  phase: EpisodePhase | string
  working_title: string
  /** Planned recording date (ISO) or null. Admin-only. */
  recording_scheduled_at: string | null
}

/**
 * The canonical guest id this candidate is linked to (null if unlinked).
 * The move-to-production gate requires this — the guest is bound before the
 * episode can enter `guest_assigned`.
 */
export async function getCandidateGuestId(candidateId: string): Promise<string | null> {
  if (!db) return null
  const [row] = await db
    .select({ guest_id: guestCandidateLinks.guest_id })
    .from(guestCandidateLinks)
    .where(eq(guestCandidateLinks.candidate_id, candidateId))
    .limit(1)
  return row?.guest_id ?? null
}

/** The EIR bridged from a given candidate (null if not bridged yet). */
export async function getEirForCandidate(
  candidateId: string,
): Promise<LinkedCandidateEir | null> {
  if (!db) return null
  const [row] = await db
    .select({
      id: episodeIntelligenceRecords.id,
      phase: episodeIntelligenceRecords.phase,
      working_title: episodeIntelligenceRecords.working_title,
      recording_scheduled_at: episodeIntelligenceRecords.recording_scheduled_at,
    })
    .from(episodeIntelligenceRecords)
    .where(
      and(
        sql`${episodeIntelligenceRecords.editorial_intent}->>'source' = 'guest_candidate'`,
        sql`${episodeIntelligenceRecords.editorial_intent}->>'source_id' = ${candidateId}`,
      ),
    )
    .orderBy(desc(episodeIntelligenceRecords.created_at))
    .limit(1)
  return row
    ? {
        id: row.id,
        phase: row.phase,
        working_title: row.working_title,
        recording_scheduled_at: row.recording_scheduled_at
          ? row.recording_scheduled_at.toISOString()
          : null,
      }
    : null
}

/**
 * Create the production EIR for an accepted, guest-linked candidate — once.
 * Returns the existing EIR if already bridged; null if the candidate is
 * missing. The CALLER enforces the accepted-status + guest-link gate; this
 * function only enforces idempotency and the EIR creation.
 */
export async function bridgeCandidateToProduction(input: {
  candidateId: string
  guestId: string
  actorId?: string | null
}): Promise<{ eir_id: string; created: boolean } | null> {
  const { candidateId, guestId, actorId } = input

  // Idempotency: one production EIR per candidate.
  const existing = await getEirForCandidate(candidateId)
  if (existing) return { eir_id: existing.id, created: false }

  const [cand] = await db!
    .select()
    .from(guestCandidates)
    .where(eq(guestCandidates.id, candidateId))
    .limit(1)
  if (!cand) return null

  const name = (cand.display_name ?? cand.full_name ?? "").trim() || "ضيف"
  const workingTitle = `حلقة مع ${name}`

  // Flatten the AI-suggested questions (opening → deep → hard → emotional)
  // so the production team inherits them as the EIR's starting question set.
  const q = (cand.ai_suggested_questions_json ?? {}) as {
    opening?: string[]
    deep?: string[]
    hard?: string[]
    emotional?: string[]
  }
  const suggested = [
    ...(q.opening ?? []),
    ...(q.deep ?? []),
    ...(q.hard ?? []),
    ...(q.emotional ?? []),
  ].filter(Boolean)

  const angles = cand.ai_conversation_angles_json ?? []

  const eir = await createEpisodeIntelligenceRecord({
    working_title: workingTitle,
    phase: "guest_assigned",
    guest_id: guestId,
    editorial_intent: {
      source: "guest_candidate",
      source_id: candidateId,
      hook: cand.ai_reason_to_invite || undefined,
      why_matters: cand.ai_summary || undefined,
      description: cand.bio || undefined,
      main_axes: angles.length ? angles : undefined,
      suggested_questions: suggested.length ? suggested : undefined,
      production_notes: cand.notes_internal || undefined,
    },
    created_by: actorId ?? "system:casting",
  })

  return { eir_id: eir.id, created: true }
}
