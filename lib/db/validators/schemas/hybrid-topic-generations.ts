/**
 * Phase 1.3 — Zod schema for hybrid_topic_generations.output_topics.
 *
 * Source-of-truth interface: HybridOutputTopic in lib/db/schema/hybrid-topics.ts.
 * Strict per element with `.loose()` so per-row metadata additions
 * (e.g. revision_history) don't get flagged.
 *
 * Note: the column stores an ARRAY of HybridOutputTopic objects. The
 * wrapper receives the array; that's what the schema validates.
 */

import { z } from "zod"

export const HYBRID_OUTPUT_TOPICS_TABLE = "hybrid_topic_generations"
export const HYBRID_OUTPUT_TOPICS_COLUMN = "output_topics"

const topicSchema = z
  .object({
    title: z.string(),
    why_it_matters: z.string(),
    why_now: z.string(),
    emotional_hook: z.string(),
    conflict_angle: z.string(),
    market_inspiration: z.string(),
    original_lens: z.string(),
    suggested_episode_type: z.string(),
    suggested_topic_domain: z.string(),
    estimated_strength_score: z.number(),
    rejected: z.boolean(),
    rejection_reasons: z.array(z.string()).optional(),
    consumed_original_topic_id: z.string().nullish(),
  })
  .loose()

export const hybridOutputTopicsSchema = z.array(topicSchema)
