/**
 * Episode «أقسام الحوار» generation job handler.
 *
 *   episode.conversation_generate — fill the empty conversation sections of one
 *                                   episode from its transcript, in the worker,
 *                                   off the nginx 120s proxy path.
 *
 * RETRY POLICY LIVES HERE, on purpose. `runConversationGeneration` returns a
 * classified failure instead of throwing, because "should we try again?" is a
 * job-layer question:
 *   • not_khat_lane / no_episode / no_session / no_transcript — facts about the
 *     data. Attempt three finds the same clip and the same missing row, so
 *     they dead-letter IMMEDIATELY via NonRetryableJobError and the operator
 *     reads the real reason in seconds instead of after ~8 minutes of doomed
 *     backoff.
 *   • generation_failed — may be a transient 5xx/timeout, so it throws a plain
 *     Error and takes the normal retry ladder. (A genuine quota exhaustion is
 *     still caught structurally by the worker's isQuotaExceededError and
 *     dead-lettered on the first attempt.)
 *
 * Either way the Arabic message travels verbatim into `jobs.error_message`,
 * which is what the admin poller renders. A generator that fails silently is
 * the one outcome this must never produce.
 */

import { registerHandler } from "../registry"
import { NonRetryableJobError } from "../types"
import { runConversationGeneration } from "@/lib/episodes/conversation-generation"
import type { ConversationField } from "@/lib/ai"
import {
  EPISODE_CONVERSATION_GENERATE_JOB,
  type EpisodeConversationJobPayload,
  type EpisodeConversationJobResult,
} from "../episode-conversation-jobs"

registerHandler<EpisodeConversationJobPayload, EpisodeConversationJobResult>(
  EPISODE_CONVERSATION_GENERATE_JOB,
  async (payload) => {
    const outcome = await runConversationGeneration(
      payload.episodeId,
      payload.only as ConversationField[] | undefined,
    )

    if (!outcome.ok) {
      if (outcome.reason === "generation_failed") throw new Error(outcome.error)
      throw new NonRetryableJobError(outcome.error)
    }

    return { filled: outcome.filled, skipped: outcome.skipped }
  },
)
