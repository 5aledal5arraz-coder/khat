/**
 * Guest-candidate PROFILE ANALYSIS job handler.
 *
 *   candidate.analyze — run the editorial candidate analysis in the worker and
 *                       persist it onto the `guest_candidates` row (same flat AI
 *                       fields the inline call wrote).
 *
 * The heavy AI work (runAiTask editorial) used to run inline in the request and
 * cross the nginx 120s wall; it now runs here, off the proxy path. The route
 * enqueues and returns a jobId; the UI polls the status endpoint.
 *
 * `analyzeCandidate` swallows failures and returns `{ ok: false, error }` (it
 * records the error onto guest_candidate_ai_runs itself). We re-THROW that error
 * so the worker marks the job failed — and, because the worker classifies quota
 * exhaustion by message (isQuotaExceededError), an out-of-credit failure still
 * dead-letters on the first attempt with the clear operator message instead of
 * burning 3 retries.
 */

import { registerHandler } from "../registry"
import { analyzeCandidate } from "@/lib/guest-candidates"
import {
  CANDIDATE_ANALYZE_JOB,
  type CandidateAnalyzeJobPayload,
  type CandidateAnalyzeJobResult,
} from "../candidate-jobs"

registerHandler<CandidateAnalyzeJobPayload, CandidateAnalyzeJobResult>(
  CANDIDATE_ANALYZE_JOB,
  async (payload) => {
    const outcome = await analyzeCandidate(payload.candidateId)
    if (!outcome.ok) {
      // Surface the underlying cause verbatim so the worker's quota/terminal
      // classification (and the UI error banner) see the real message.
      throw new Error(outcome.error)
    }
    return { runId: outcome.runId }
  },
)
