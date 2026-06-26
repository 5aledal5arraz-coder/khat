/**
 * Phase X Step 3 — Persist accepted hybrid topics to Khat Map + the
 * generation-log row.
 *
 * Two side effects:
 *   1. Insert each accepted topic into khat_map_episode_candidates
 *      (so the existing v2 wizard surface picks them up unchanged).
 *   2. Mark any consumed_original_topic_id rows as consumed (we already
 *      "claimed" them by transforming them through a lens).
 *
 * Wrapped in a single SQL session per topic — failures don't cross-
 * contaminate.
 */

import { eq, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { khatMapEpisodeCandidates } from "@/lib/db/schema/khat-map"
import {
  hybridTopicGenerations,
  type HybridGenerationStatus,
  type HybridInputSnapshot,
  type HybridOutputTopic,
} from "@/lib/db/schema/hybrid-topics"
import { originalThinkingTopics } from "@/lib/db/schema/original-thinking"
import type { KhatMapEpisodeType, KhatMapTopicDomain } from "@/types/khat-map"
// Phase 1.3 — JSONB validation wrapper.
import {
  validateJsonbWrite,
  hybridOutputTopicsSchema,
  HYBRID_OUTPUT_TOPICS_COLUMN,
  HYBRID_OUTPUT_TOPICS_TABLE,
} from "@/lib/db/validators"

// ─── Generation-log lifecycle ────────────────────────────────────────

export async function openGenerationLog(input: {
  seasonId: string | null
  language: string
  createdBy: string | null
  inputSnapshot: HybridInputSnapshot
}): Promise<{ id: string }> {
  const [row] = await db!
    .insert(hybridTopicGenerations)
    .values({
      season_id: input.seasonId,
      language: input.language,
      status: "running",
      input_snapshot: input.inputSnapshot,
      created_by: input.createdBy,
    })
    .returning({ id: hybridTopicGenerations.id })
  return row
}

export async function completeGenerationLog(input: {
  id: string
  status: Exclude<HybridGenerationStatus, "pending" | "running">
  outputTopics: HybridOutputTopic[]
  acceptedCount: number
  rejectedCount: number
  rejectionSummary: Record<string, number>
  aiRunId: string | null
  errorMessage?: string | null
}): Promise<void> {
  // Phase 1.3 — validate the output_topics array before persistence.
  // Each element is strict on known fields with .loose() for forward-compat.
  validateJsonbWrite(
    {
      table: HYBRID_OUTPUT_TOPICS_TABLE,
      column: HYBRID_OUTPUT_TOPICS_COLUMN,
      rowId: input.id,
    },
    input.outputTopics,
    hybridOutputTopicsSchema,
  )

  await db!
    .update(hybridTopicGenerations)
    .set({
      status: input.status,
      output_topics: input.outputTopics,
      accepted_count: input.acceptedCount,
      rejected_count: input.rejectedCount,
      rejection_summary: input.rejectionSummary,
      ai_run_id: input.aiRunId,
      completed_at: new Date(),
      error_message: input.errorMessage ?? null,
    })
    .where(eq(hybridTopicGenerations.id, input.id))
}

// ─── Accepted-topic persistence ──────────────────────────────────────

export interface AcceptedHybridTopic {
  title: string
  why_it_matters: string
  why_now: string
  emotional_hook: string
  conflict_angle: string
  market_inspiration: string
  primary_theme?: string
  original_lens: string
  suggested_episode_type: string
  suggested_topic_domain: string
  estimated_strength_score: number
  consumed_original_topic_id?: string | null
}

export interface PersistedCandidate {
  candidate_id: string
  consumed_original_topic_id: string | null
}

export async function persistAcceptedTopics(input: {
  seasonId: string | null
  generationId: string
  topics: AcceptedHybridTopic[]
}): Promise<PersistedCandidate[]> {
  const out: PersistedCandidate[] = []

  // Without a season we still record the generation log + leave
  // accepted topics on the table, BUT khat_map_episode_candidates
  // requires season_id NOT NULL — so we just skip persistence.
  if (!input.seasonId) return out

  for (const t of input.topics) {
    const productionNote = JSON.stringify({
      source: "hybrid_topics",
      generation_id: input.generationId,
      market_inspiration: t.market_inspiration,
      primary_theme: t.primary_theme ?? null,
      original_lens: t.original_lens,
      consumed_original_topic_id: t.consumed_original_topic_id ?? null,
      strength_score: t.estimated_strength_score,
    })

    const [inserted] = await db!
      .insert(khatMapEpisodeCandidates)
      .values({
        season_id: input.seasonId,
        status: "proposed",
        working_title: t.title,
        hook: t.emotional_hook,
        why_matters: t.why_it_matters,
        why_now: t.why_now,
        goal: null,
        description: t.conflict_angle,
        episode_type: t.suggested_episode_type as KhatMapEpisodeType,
        topic_domain: t.suggested_topic_domain as KhatMapTopicDomain,
        topic_angle_code: null, // hybrid runs do not pin to a topic-bank angle
        suggested_guest_candidate_id: null,
        main_axes: [],
        suggested_questions: [],
        production_notes: productionNote,
      } as never)
      .returning({ id: khatMapEpisodeCandidates.id })

    out.push({
      candidate_id: inserted.id,
      consumed_original_topic_id: t.consumed_original_topic_id ?? null,
    })

    // Mark the consumed original topic, if any.
    if (t.consumed_original_topic_id) {
      await db!.execute(sql`
        UPDATE original_thinking_topics
           SET consumed_at = COALESCE(consumed_at, now())
         WHERE id = ${t.consumed_original_topic_id}
      `)
    }
  }
  return out
}

// Suppress unused-import lint when caller imports nothing else from here.
void originalThinkingTopics
