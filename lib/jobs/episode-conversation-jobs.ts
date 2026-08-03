/**
 * Episode «أقسام الحوار» generation — shared type + constant contract.
 *
 * The generation reads a full transcript, chunk-summarizes it and makes one
 * editorial AI call: ~132s measured. nginx cuts a proxied request at 120s on
 * the droplet, so running it inline would hand the operator a severed
 * connection instead of a result — the same wall that already forced the
 * candidate AI calls into the worker (lib/jobs/candidate-jobs.ts). It runs as
 * a background job for that reason and no other.
 *
 * This module is SIDE-EFFECT-FREE (no handler registration, no db import) so
 * the admin server actions can import the job-type constant and payload shapes
 * without dragging the handler's AI/db module graph into their bundle. The
 * handler imports these too and registers against the same constant.
 *
 * Naming follows the existing `domain.action` convention.
 */

export const EPISODE_CONVERSATION_GENERATE_JOB = "episode.conversation_generate"

export interface EpisodeConversationJobPayload extends Record<string, unknown> {
  episodeId: string
  /** Optional subset of the five fields. Omitted = every field still empty. */
  only?: string[]
}

export interface EpisodeConversationJobResult extends Record<string, unknown> {
  /** Fields the run actually wrote. Empty = nothing was blank, nothing paid for. */
  filled: string[]
  /** Fields left alone because they already held human content. */
  skipped: string[]
}
